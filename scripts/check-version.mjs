import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import(new URL('../version.js', import.meta.url));

const release = globalThis.KIDNEY_HEALTH_RELEASE;
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const siteScript = await readFile(new URL('../site.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

assert.match(release.productVersion, /^\d+\.\d+\.\d+$/);
assert.match(release.buildId, /^[A-Za-z0-9._-]+$/);
assert.match(
  indexHtml,
  new RegExp(`name="app-version" content="${release.productVersion.replaceAll('.', '\\.')}"`),
);
assert.match(indexHtml, new RegExp(`version\\.js\\?v=${release.productVersion.replaceAll('.', '\\.')}`));
assert.match(indexHtml, new RegExp(`site\\.js\\?v=${release.productVersion.replaceAll('.', '\\.')}`));
assert.match(indexHtml, /data-app-version/);
assert.match(indexHtml, /data-build-id/);
assert.doesNotMatch(indexHtml, /\.unregister\s*\(/);
assert.match(siteScript, /updateViaCache:\s*'none'/);
assert.match(serviceWorker, /CACHE_PREFIX = 'kidney-health-build-'/);
assert.doesNotMatch(serviceWorker, /addEventListener\s*\(\s*['"]fetch['"]/);

console.log(`Static website version checks passed for v${release.productVersion}, build ${release.buildId}.`);
