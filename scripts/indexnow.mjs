// Notify IndexNow (Bing, Yandex, Naver, ...) about changed pages.
// Usage:
//   node scripts/indexnow.mjs                      # every URL in sitemap.xml
//   node scripts/indexnow.mjs articles/foo.html    # only these paths or full URLs
// Run after the change is live: the key file must already return 200.
import { readFile, readdir } from 'node:fs/promises';

const HOST = 'jackcanhelp.org';
const ORIGIN = `https://${HOST}`;
const root = new URL('../', import.meta.url);

const keyFile = (await readdir(root)).find((name) => /^[a-f0-9]{32}\.txt$/.test(name));
if (!keyFile) throw new Error('IndexNow key file (<32 hex>.txt) not found at site root.');
const key = (await readFile(new URL(keyFile, root), 'utf8')).trim();

let urlList = process.argv.slice(2).map((arg) =>
  /^https?:\/\//.test(arg) ? arg : `${ORIGIN}/${arg.replace(/^\/+/, '')}`,
);
if (urlList.length === 0) {
  const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
  urlList = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

const foreign = urlList.filter((url) => new URL(url).host !== HOST);
if (foreign.length) throw new Error(`URLs outside ${HOST}: ${foreign.join(', ')}`);

const keyLocation = `${ORIGIN}/${keyFile}`;
const probe = await fetch(keyLocation);
if (!probe.ok || (await probe.text()).trim() !== key) {
  throw new Error(`Key file is not live yet (${probe.status} ${keyLocation}). Deploy first.`);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation, urlList }),
});
console.log(`IndexNow ${res.status} for ${urlList.length} URL(s).`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exitCode = 1;
}
