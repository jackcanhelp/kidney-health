// 入口票券預取快取的回歸守衛。
// 直接從 index.html 抽出實際上線的那幾個函式原始碼來跑，不是複製一份來測。
// 跑法： node entry-ticket-cache.test.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// 用純字串切片抽取，不用 regex：跳脫規則太容易把量尺自己弄壞。
function sliceFrom(startMarker, endMarker) {
  const i = html.indexOf(startMarker);
  if (i < 0) throw new Error('抽不到 ' + startMarker.trim() + '，index.html 結構可能改了');
  const j = html.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error('找不到 ' + startMarker.trim() + ' 的結尾');
  return html.slice(i, j + endMarker.length);
}
const LINE_END = ';';
const FN_END = String.fromCharCode(10) + '        }';
const extract = (name, kind) =>
  kind === 'const'
    ? sliceFrom('        const ' + name + ' = ', LINE_END)
    : sliceFrom('        function ' + name + '(', FN_END);

const SOURCE = [
  extract('ENTRY_TICKET_REUSE_MS', 'const'),
  extract('entryTicketCache', 'const'),
  extract('isLocalToolPreview', 'fn'),
  extract('warmEntryTicket', 'fn'),
  extract('takeEntryTicket', 'fn'),
].join('\n');

// 用工廠重建一個乾淨環境，讓每個案例互不污染。
function makeEnv({ hostname = 'jackcanhelp.org', now = () => Date.now(), fail = false } = {}) {
  const state = { issued: 0 };
  const location = { hostname };
  const Date_ = { now };
  const createEntryTicketUrl = (kind) => {
    state.issued += 1;
    return fail ? Promise.reject(new Error('boom')) : Promise.resolve(`url:${kind}:${state.issued}`);
  };
  const fn = new Function('location', 'Date', 'createEntryTicketUrl',
    `${SOURCE}\nreturn { warmEntryTicket, takeEntryTicket, entryTicketCache };`);
  return { ...fn(location, Date_, createEntryTicketUrl), state };
}

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : (fail++, console.log(`FAIL  ${name}`)); };

// 1. 預熱後點擊 → 沿用同一張票，不重簽
{
  const e = makeEnv();
  e.warmEntryTicket('aimed');
  const p = e.takeEntryTicket('aimed');
  check('1 預熱後點擊只簽一次', e.state.issued === 1);
  check('1 拿到的是預熱那張', (await p) === 'url:aimed:1');
}
// 2. 超過重用視窗 → 重新簽發（不能用過期票）
{
  let t = 1_000_000;
  const e = makeEnv({ now: () => t });
  e.warmEntryTicket('aimed');
  t += 61_000;                       // 超過 ENTRY_TICKET_REUSE_MS
  await e.takeEntryTicket('aimed');
  check('2 過期票不沿用，會重簽', e.state.issued === 2);
}
// 3. 沒預熱直接點 → 照樣拿得到票
{
  const e = makeEnv();
  check('3 未預熱也能取票', (await e.takeEntryTicket('kdigo')) === 'url:kdigo:1');
}
// 4. 一張票只用一次 → 第二次點擊要重簽
{
  const e = makeEnv();
  e.warmEntryTicket('aimed');
  await e.takeEntryTicket('aimed');
  await e.takeEntryTicket('aimed');
  check('4 票券一次性，第二次重簽', e.state.issued === 2);
}
// 5. 連續預熱不重複簽發
{
  const e = makeEnv();
  e.warmEntryTicket('aimed'); e.warmEntryTicket('aimed'); e.warmEntryTicket('aimed');
  check('5 重複預熱只簽一次', e.state.issued === 1);
}
// 6. 預熱失敗 → 快取清掉，點擊時重簽（且不留 unhandled rejection）
{
  const e = makeEnv({ fail: true });
  e.warmEntryTicket('aimed');
  await new Promise((r) => setImmediate(r));      // 讓 .catch 跑完
  check('6 失敗後快取被清空', e.entryTicketCache.aimed === null);
  await e.takeEntryTicket('aimed').catch(() => {});
  check('6 失敗後點擊會重簽', e.state.issued === 2);
}
// 7. 本機預覽 → 完全不簽票
{
  const e = makeEnv({ hostname: 'localhost' });
  e.warmEntryTicket('aimed');
  check('7 localhost 不預取', e.state.issued === 0);
}
// 8. 兩個工具的快取互不干擾
{
  const e = makeEnv();
  e.warmEntryTicket('aimed');
  await e.takeEntryTicket('kdigo');
  check('8 kdigo 取票不消耗 aimed 的', e.entryTicketCache.aimed !== null);
}

console.log(`\n${pass} passed, ${fail} failed  (共 ${pass + fail} 項)`);
process.exit(fail === 0 ? 0 : 1);
