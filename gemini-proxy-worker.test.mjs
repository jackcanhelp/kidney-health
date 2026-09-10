// 最小回歸守衛：確認 Worker 的 origin 白名單既放行正式網域、也擋掉冒充網域。
// 跑法： node gemini-proxy-worker.test.mjs
import { isOriginAllowed } from './gemini-proxy-worker.js';

const CASES = [
  // [origin, 應否放行, 說明]
  ['https://jackcanhelp.org',              true,  '正式網域（2026-09-09 起）'],
  ['https://www.jackcanhelp.org',          true,  'www（目前 301 到 apex，仍保留）'],
  ['https://jackcanhelp.github.io',        true,  '舊網址，仍有開著的分頁'],
  ['http://localhost:8000',                true,  '本機開發（帶 port）'],
  ['http://localhost',                     true,  '本機開發（不帶 port）'],
  ['http://127.0.0.1:5500',                true,  'Live Server 常用 port'],
  ['https://jackcanhelp.org.evil.com',     false, '冒充：正式網域當前綴'],
  ['https://jackcanhelp.github.io.evil.com', false, '冒充：舊網址當前綴'],
  ['http://localhost.evil.com',            false, '冒充：localhost 當前綴'],
  ['https://evil.com',                     false, '無關網域'],
  ['',                                     false, '空 Origin'],
  [null,                                   false, 'null Origin'],
];

let pass = 0, fail = 0;
for (const [origin, expected, note] of CASES) {
  const actual = isOriginAllowed(origin);
  if (actual === expected) { pass++; }
  else {
    fail++;
    console.log(`FAIL  origin=${JSON.stringify(origin)}  預期=${expected} 實際=${actual}  (${note})`);
  }
}
console.log(`\n${pass} passed, ${fail} failed  (共 ${CASES.length} 項)`);
process.exit(fail === 0 ? 0 : 1);
