// 文章清單的單一來源是 articles/index.html 的 <ul class="post-list">。
// 這支腳本依日期由新到舊排序，並同步產生：
//   - 索引頁的篇數、CollectionPage ItemList
//   - 首頁「衛教文章」區塊的最新 6 張卡片（第一張掛「最新」）與「瀏覽全部 N 篇」
//   - sitemap.xml 缺的文章網址，以及首頁、索引頁的 lastmod
//   - search-index.json：站內搜尋用（文章全文、漫畫、專業領域、工具），search.js 讀取
//
// 用法：
//   node scripts/sync-articles.mjs          寫入
//   node scripts/sync-articles.mjs --check  只檢查，不同步就 exit 1
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SITE = 'https://jackcanhelp.org';
const HOME_CARDS = 6;
const root = new URL('../', import.meta.url);

const read = async (rel) => {
  const raw = await readFile(new URL(rel, root), 'utf8');
  return { raw, text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
};
const toDisk = (file, text) => (file.crlf ? text.replace(/\n/g, '\r\n') : text);
const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// 去掉註解（含待醫師確認的出處）、script/style、標籤，只留讀者看得到的字
const plainText = (html) =>
  decode(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

function replaceOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`找不到 ${label}`);
  return text.replace(pattern, replacement);
}

export async function syncArticles({ write = true } = {}) {
  const idx = await read('articles/index.html');
  const home = await read('index.html');
  const map = await read('sitemap.xml');

  // 1. 解析索引頁的文章卡片
  const listMatch = idx.text.match(/<ul class="post-list">\n([\s\S]*?)\n  <\/ul>/);
  if (!listMatch) throw new Error('找不到 articles/index.html 的 post-list');
  const blocks = listMatch[1].match(/    <li>\n[\s\S]*?\n    <\/li>/g) ?? [];
  const articles = blocks.map((block, order) => {
    const get = (re, label) => {
      const m = block.match(re);
      if (!m) throw new Error(`文章卡片缺 ${label}：\n${block}`);
      return m[1];
    };
    return {
      block,
      order,
      href: get(/<a href="([^"]+)" class="post">/, 'href'),
      tag: get(/<span class="post-tag">(.*?)<\/span>/, 'post-tag'),
      title: get(/<h2>(.*?)<\/h2>/, 'h2'),
      desc: get(/<p>(.*?)<\/p>/, 'p'),
      date: get(/<time datetime="(\d{4}-\d{2}-\d{2})">/, 'time datetime'),
    };
  });
  if (articles.length === 0) throw new Error('post-list 沒有任何文章');
  for (const a of articles) {
    await access(new URL(`articles/${a.href}`, root)).catch(() => {
      throw new Error(`索引頁列了 ${a.href}，但 articles/ 底下沒有這個檔`);
    });
  }
  const dupes = articles.map((a) => a.href).filter((h, i, all) => all.indexOf(h) !== i);
  if (dupes.length) throw new Error(`索引頁重複列了：${dupes.join(', ')}`);

  // 新到舊；同一天維持原本順序
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order);
  const n = articles.length;
  const newest = articles[0].date;

  // 2. 索引頁：排序、篇數、ItemList
  let idxOut = idx.text.replace(
    listMatch[0],
    `<ul class="post-list">\n\n${articles.map((a) => a.block).join('\n\n')}\n\n  </ul>`,
  );
  idxOut = replaceOnce(idxOut, /目前共 <strong>\d+<\/strong> 篇/, `目前共 <strong>${n}</strong> 篇`, '索引頁篇數');
  const items = articles
    .map(
      (a, i) => `          {
            "@type": "ListItem",
            "position": ${i + 1},
            "url": ${JSON.stringify(`${SITE}/articles/${a.href}`)},
            "name": ${JSON.stringify(decode(a.title))}
          }`,
    )
    .join(',\n');
  idxOut = replaceOnce(
    idxOut,
    /"numberOfItems": \d+,\n        "itemListElement": \[\n[\s\S]*?\n        \]/,
    `"numberOfItems": ${n},\n        "itemListElement": [\n${items}\n        ]`,
    'CollectionPage ItemList',
  );

  // 3. 首頁：最新 6 張卡片與總篇數
  const cards = articles
    .slice(0, HOME_CARDS)
    .map((a, i) => {
      const tag =
        i === 0
          ? `<span class="card-tags"><span class="comic-category">${a.tag}</span><span class="badge-new">最新</span></span>`
          : `<span class="comic-category">${a.tag}</span>`;
      return `                <a href="articles/${a.href}" class="article-card fade-in">
                    ${tag}
                    <h3>${a.title}</h3>
                    <p>${a.desc}</p>
                    <div class="comic-meta">
                        <span>📅 ${a.date}</span>
                        <span class="read-more">閱讀更多 →</span>
                    </div>
                </a>`;
    })
    .join('\n');
  let homeOut = replaceOnce(
    home.text,
    /(<section id="articles">[\s\S]*?<div class="articles-grid">\n)[\s\S]*?(\n            <\/div>\n\n            <p class="articles-popular">)/,
    (_, head, tail) => `${head}${cards}${tail}`,
    '首頁 articles-grid',
  );
  homeOut = replaceOnce(homeOut, /瀏覽全部 \d+ 篇文章/, `瀏覽全部 ${n} 篇文章`, '首頁篇數按鈕');

  // 4. sitemap：補上缺的文章，首頁與索引頁 lastmod 不早於最新文章
  let mapOut = map.text;
  const missing = articles.filter((a) => !mapOut.includes(`<loc>${SITE}/articles/${a.href}</loc>`));
  if (missing.length) {
    const entries = missing
      .map(
        (a) => `  <url>
    <loc>${SITE}/articles/${a.href}</loc>
    <lastmod>${a.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
      )
      .join('\n');
    mapOut = replaceOnce(
      mapOut,
      /(<loc>https:\/\/jackcanhelp\.org\/articles\/<\/loc>[\s\S]*?<\/url>\n)/,
      (m) => `${m}${entries}\n`,
      'sitemap 的 /articles/ 項目',
    );
  }
  for (const path of ['/', '/articles/']) {
    const re = new RegExp(`(<loc>${SITE}${path}</loc>\\n    <lastmod>)(\\d{4}-\\d{2}-\\d{2})`);
    mapOut = mapOut.replace(re, (m, head, d) => (d < newest ? `${head}${newest}` : m));
  }

  // 5. 站內搜尋索引：文章全文（到「參考依據」為止）＋首頁的漫畫、專業領域、工具卡片
  const searchItems = [];
  for (const a of articles) {
    const html = (await read(`articles/${a.href}`)).text;
    const body = html.match(/<article>([\s\S]*?)(?:<h2>參考依據|<\/article>)/);
    if (!body) throw new Error(`articles/${a.href} 找不到 <article> 內文`);
    searchItems.push({
      type: '文章',
      tag: decode(a.tag),
      title: decode(a.title),
      desc: decode(a.desc),
      url: `articles/${a.href}`,
      // 「延伸閱讀」與段落跳轉卡片是導覽，不算內文
      text: plainText(body[1].replace(/<div class="related">[\s\S]*?<\/div>/g, '')),
    });
  }
  const section = (id) => {
    const m = homeOut.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`));
    if (!m) throw new Error(`首頁找不到 #${id}`);
    return m[0];
  };
  const collect = (id, re, build) => {
    const found = [...section(id).matchAll(re)].map(build);
    if (found.length === 0) throw new Error(`首頁 #${id} 解析不到任何卡片`);
    searchItems.push(...found);
  };
  collect(
    'comics',
    /<a href="([^"]+\.pdf)"[^>]*class="comic-card[\s\S]*?<span class="comic-category">(.*?)<\/span>\s*<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>/g,
    ([, url, tag, title, desc]) => ({ type: '衛教漫畫', tag: decode(tag), title: decode(title), desc: decode(desc), url }),
  );
  collect(
    'expertise',
    /<a href="([^"]+\.pdf)"[^>]*class="expertise-card[\s\S]*?<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>\s*<ul class="expertise-list">([\s\S]*?)<\/ul>/g,
    ([, url, title, desc, list]) => ({ type: '專業領域', title: decode(title), desc: decode(desc), url, text: plainText(list) }),
  );
  collect(
    'tools',
    /<div class="tool-card[^"]*"[^>]*>\s*<div class="tool-icon">[\s\S]*?<\/div>\s*<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>/g,
    ([, title, desc]) => ({ type: '實用工具', title: decode(title), desc: decode(desc), tool: decode(title) }),
  );
  const searchOut = `${JSON.stringify({ items: searchItems })}\n`;
  let search;
  try {
    search = await read('search-index.json');
  } catch {
    search = { raw: '', text: null, crlf: false };
  }

  // 6. 比對、寫入
  const outputs = [
    ['articles/index.html', idx, idxOut],
    ['index.html', home, homeOut],
    ['sitemap.xml', map, mapOut],
    ['search-index.json', search, searchOut],
  ];
  const changed = outputs.filter(([, file, out]) => out !== file.text).map(([rel]) => rel);
  if (write) {
    for (const [rel, file, out] of outputs) {
      if (out !== file.text) await writeFile(new URL(rel, root), toDisk(file, out), 'utf8');
    }
  }
  return { count: n, newest: articles[0], homepage: articles.slice(0, HOME_CARDS).map((a) => a.href), changed, missing: missing.map((a) => a.href) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  try {
    const r = await syncArticles({ write: !check });
    console.log(`共 ${r.count} 篇，最新：${r.newest.href}（${r.newest.date}）`);
    console.log(`首頁卡片：${r.homepage.join(', ')}`);
    if (r.missing.length) console.log(`sitemap 補上：${r.missing.join(', ')}`);
    if (check && r.changed.length) {
      console.error(`未同步：${r.changed.join(', ')}。請跑 node scripts/sync-articles.mjs`);
      process.exit(1);
    }
    console.log(r.changed.length ? `${check ? '待' : '已'}更新：${r.changed.join(', ')}` : '三處都已同步，沒有變動。');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
