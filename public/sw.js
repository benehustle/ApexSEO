const CACHE_NAME = 'blog-automation-v3';
const urlsToCache = [
  '/',
  '/index.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.error('Cache install failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension, chrome, and other non-http/https schemes
  const url = new URL(event.request.url);
  if (!['http:', 'https:'].includes(url.protocol)) {
    return;
  }

  // In development (localhost), always bypass cache and fetch from network
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Always fetch HTML and JavaScript from network to get fresh code
  if (event.request.destination === 'document' || 
      url.pathname === '/' || 
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.tsx') ||
      url.pathname.endsWith('.ts')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        const cached = caches.match(event.request);
        return cached || fetch(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(fetchResponse => {
          // Don't cache non-successful responses
          if (!fetchResponse || fetchResponse.status !== 200) {
            return fetchResponse;
          }

          // Only cache same-origin requests
          if (url.origin !== self.location.origin) {
            return fetchResponse;
          }

          // Clone the response
          const responseToCache = fetchResponse.clone();

          caches.open(CACHE_NAME).then(cache => {
            try {
              cache.put(event.request, responseToCache);
            } catch (err) {
              // Silently fail if caching fails (e.g., for chrome-extension URLs)
              console.warn('Failed to cache:', event.request.url);
            }
          });

          return fetchResponse;
        }).catch(() => {
          // If fetch fails, try to return cached version or a proper error response
          return caches.match(event.request).then(cached => {
            if (cached) {
              return cached;
            }
            // Return a proper Response object if nothing is cached
            return new Response('Network error', { status: 408, statusText: 'Request Timeout' });
          });
        });
      })
  );
});
