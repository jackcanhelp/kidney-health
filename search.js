/* 站內搜尋：點選單的 🔍 才載入 search-index.json（由 scripts/sync-articles.mjs 產生）。
 * 不送出任何搜尋字詞到外部服務。
 */
(() => {
  // 病人常打的說法 → 站上文章用的詞。單向對照：搜「洗腎」也找「透析」，搜「透析」不會反過來。
  // 待醫師增補門診常聽到的說法。
  const SYNONYMS = {
    腎指數: ['肌酸酐', 'egfr', '腎功能'],
    肌酐: ['肌酸酐'],
    洗腎: ['透析'],
    洗肚子: ['腹膜透析'],
    人工腎臟: ['透析'],
    尿毒: ['尿素氮', 'bun', '尿毒素'],
    泡泡尿: ['蛋白尿'],
    尿蛋白: ['蛋白尿'],
    血鉀: ['鉀'],
    瘻管: ['廔管', '血管通路'],
    廔管: ['瘻管', '血管通路'],
    腎衰竭: ['慢性腎臟病', '腎臟衰竭'],
    腎臟病: ['慢性腎臟病', 'ckd'],
    ckd: ['慢性腎臟病'],
    心衰竭: ['心臟衰竭', '心衰'],
    心臟衰竭: ['心衰竭', '心衰'],
    骨鬆: ['骨質疏鬆', '腎性骨病變'],
    epo: ['紅血球生成素'],
    pth: ['副甲狀腺'],
    皮膚癢: ['搔癢', '癢'],
    計算機: ['計算'],
  };
  const MAIL = 'calldrjackhere@gmail.com';
  const MAX_RESULTS = 20;

  const dialog = document.getElementById('siteSearch');
  const input = document.getElementById('siteSearchInput');
  const list = document.getElementById('siteSearchResults');
  const status = document.getElementById('siteSearchStatus');
  if (!dialog || !input || !list || !status) return;

  let items = null;
  let loading = null;

  // 全形轉半形、轉小寫，但逐字處理、長度不變（「…」NFKC 會變三個字，就保留原字），
  // 這樣正規化後的位置能直接拿來切原文、標亮。
  const norm = (s) =>
    [...(s || '')]
      .map((c) => {
        const n = c.normalize('NFKC').toLowerCase();
        return n.length === c.length ? n : c;
      })
      .join('');
  const isLatin = (s) => /^[a-z0-9./-]+$/.test(s);
  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function load() {
    if (!loading) {
      const v = globalThis.KIDNEY_HEALTH_RELEASE?.buildId || Date.now();
      loading = fetch(`search-index.json?v=${encodeURIComponent(v)}`)
        .then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then((data) => {
          items = data.items.map((it) => {
            const fields = {
              title: norm(it.title),
              tag: norm(`${it.type} ${it.tag || ''}`),
              desc: norm(it.desc),
              text: norm(it.text),
            };
            const all = `${fields.title} ${fields.tag} ${fields.desc} ${fields.text}`;
            return { ...it, fields, all, words: new Set(all.match(/[a-z0-9]+/g) || []) };
          });
        })
        .catch((err) => {
          loading = null;
          throw err;
        });
    }
    return loading;
  }

  // Damerau（相鄰對調算一次）編輯距離，只用在英文縮寫：egrf → egfr
  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  // 一個搜尋詞在一筆資料裡的比對結果：exact（含同義詞）優先，否則模糊
  function matchTerm(item, term) {
    const variants = [term, ...(SYNONYMS[term] || [])];
    let score = 0;
    const hits = [];
    for (const v of variants) {
      const weight = v === term ? 1 : 0.8;
      const f = item.fields;
      let s = 0;
      if (f.title.includes(v)) s += 10;
      if (f.tag.includes(v)) s += 6;
      if (f.desc.includes(v)) s += 4;
      if (f.text.includes(v)) s += 1 + Math.min(f.text.split(v).length - 2, 5);
      if (s) {
        score += s * weight;
        hits.push(v);
      }
    }
    if (hits.length) return { score, hits, fuzzy: false };

    // 模糊：英文縮寫容許打錯一兩個字母
    if (isLatin(term) && term.length >= 3) {
      const limit = term.length >= 6 ? 2 : 1;
      const near = [...item.words].filter((w) => Math.abs(w.length - term.length) <= limit && editDistance(term, w) <= limit);
      if (near.length) return { score: 3, hits: near, fuzzy: true };
      return null;
    }
    // 模糊：中文漏字或多字（「腎貧血」→「腎性貧血」），看兩字片段有一半以上出現
    if (term.length >= 3) {
      const grams = [];
      for (let i = 0; i < term.length - 1; i++) grams.push(term.slice(i, i + 2));
      const found = grams.filter((g) => item.all.includes(g));
      if (found.length / grams.length >= 0.5) {
        const titleBonus = found.some((g) => item.fields.title.includes(g)) ? 3 : 0;
        return { score: found.length + titleBonus, hits: found, fuzzy: true };
      }
    }
    return null;
  }

  function search(query) {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const results = [];
    for (const item of items) {
      let score = 0;
      let fuzzy = false;
      const hits = [];
      for (const term of terms) {
        const m = matchTerm(item, term);
        if (!m) {
          score = 0;
          break;
        }
        score += m.score;
        fuzzy ||= m.fuzzy;
        hits.push(...m.hits);
      }
      if (score) results.push({ item, score, fuzzy, hits });
    }
    // 完全符合的排前面，模糊的接在後面
    return results.sort((a, b) => a.fuzzy - b.fuzzy || b.score - a.score).slice(0, MAX_RESULTS);
  }

  // 在原文（非正規化）上標亮：NFKC/小寫不改變中文長度，英文全形字例外時退回不標亮
  function highlight(text, hits) {
    const lower = norm(text);
    if (lower.length !== text.length) return escapeHtml(text);
    const marks = [];
    for (const h of hits) {
      let i = lower.indexOf(h);
      while (h && i !== -1) {
        marks.push([i, i + h.length]);
        i = lower.indexOf(h, i + h.length);
      }
    }
    marks.sort((a, b) => a[0] - b[0]);
    let out = '';
    let pos = 0;
    for (const [s, e] of marks) {
      if (s < pos) continue;
      out += `${escapeHtml(text.slice(pos, s))}<mark>${escapeHtml(text.slice(s, e))}</mark>`;
      pos = e;
    }
    return out + escapeHtml(text.slice(pos));
  }

  function snippet(item, hits) {
    const text = item.text || '';
    const lower = norm(text);
    let at = -1;
    for (const h of hits) {
      const i = lower.indexOf(h);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    if (at === -1 || norm(item.desc).includes(hits[0])) return item.desc;
    const start = Math.max(0, at - 30);
    return `${start > 0 ? '……' : ''}${text.slice(start, at + 60)}${at + 60 < text.length ? '……' : ''}`;
  }

  function render() {
    const q = input.value.trim();
    list.innerHTML = '';
    if (!q) {
      status.textContent = '可以搜尋文章、衛教漫畫、專業領域與實用工具，例如「洗腎」「腎指數」「高血鉀」。';
      return;
    }
    if (!items) return;
    const results = search(q);
    if (!results.length) {
      status.innerHTML = `找不到「${escapeHtml(q)}」相關的內容。這個主題還沒寫，歡迎<a href="mailto:${MAIL}?subject=${encodeURIComponent('衛教主題建議')}">來信告訴我</a>。`;
      return;
    }
    const exact = results.filter((r) => !r.fuzzy).length;
    status.textContent = exact
      ? `找到 ${results.length} 筆${results.length > exact ? `（其中 ${results.length - exact} 筆是相近的結果）` : ''}`
      : `沒有完全符合的結果，以下是相近的 ${results.length} 筆`;
    const frag = document.createDocumentFragment();
    for (const { item, hits } of results) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'search-result';
      if (item.url) {
        a.href = item.url;
        if (/\.pdf$/i.test(item.url)) {
          a.target = '_blank';
          a.rel = 'noopener';
        }
      } else {
        a.href = '#tools';
        a.dataset.tool = item.tool;
      }
      a.innerHTML = `<span class="search-kind">${escapeHtml(item.type)}${item.tag ? `・${escapeHtml(item.tag)}` : ''}</span>
        <span class="search-title">${highlight(item.title, hits)}</span>
        <span class="search-snippet">${highlight(snippet(item, hits), hits)}</span>`;
      li.appendChild(a);
      frag.appendChild(li);
    }
    list.appendChild(frag);
  }

  function open() {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
    input.focus();
    render();
    if (!items) {
      status.textContent = '載入中……';
      load().then(render, () => {
        status.textContent = '搜尋資料載入失敗，請檢查網路後再試一次。';
      });
    }
  }

  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
  });
  // 點對話框外的暗色背景就關閉
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.getElementById('siteSearchClose')?.addEventListener('click', close);

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      list.querySelector('a')?.click();
    }
  });

  list.addEventListener('click', (e) => {
    const a = e.target.closest('a.search-result');
    if (!a) return;
    if (a.dataset.tool) {
      // 工具在首頁是彈出視窗，直接觸發對應卡片
      e.preventDefault();
      close();
      const card = [...document.querySelectorAll('#tools .tool-card')].find(
        (c) => c.querySelector('h3')?.textContent.trim() === a.dataset.tool,
      );
      if (card) card.click();
      else location.hash = '#tools';
    } else if (a.target !== '_blank') {
      close();
    }
  });

  document.querySelectorAll('[data-open-search]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    }),
  );
})();
