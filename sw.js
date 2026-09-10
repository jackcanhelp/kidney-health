'use strict';

importScripts('./version.js');

const release = self.KIDNEY_HEALTH_RELEASE;
if (!release || !release.productVersion || !release.buildId) {
  throw new Error('Missing kidney-health release metadata.');
}

const CACHE_PREFIX = 'kidney-health-build-';
const CURRENT_CACHE = `${CACHE_PREFIX}${release.buildId}`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CURRENT_CACHE)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'VERSION',
      productVersion: release.productVersion,
      buildId: release.buildId
    });
  }
});

// Intentionally no fetch handler: medical pages and data always use the network.
