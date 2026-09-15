/* Nexora Engine — service worker (A3: installable PWA + offline app shell)
 * ───────────────────────────────────────────────────────────────────────────
 * Scope of this file, deliberately narrow:
 *   · make the app INSTALLABLE (manifest + a worker with a fetch handler)
 *   · keep the app usable with the network down, once it has been used online
 * It holds NO business logic and touches NO data.
 *
 * TWO RULES keep this safe:
 *
 * 1. NETWORK-FIRST. When the network answers, the browser gets exactly what it
 *    gets today: the live file, every time. The cache is only ever a fallback,
 *    so an online user can never be pinned to a stale bundle.
 *
 * 2. ALLOWLIST, NOT DENYLIST. Only URLs listed below are ever cached or served
 *    from the cache. Everything else — Supabase, the CDN fallbacks, /api/*, and
 *    crucially any same-origin URL we have not explicitly vouched for — is left
 *    entirely to the browser: no `respondWith`, no `cache.put`. This matters for
 *    the cloud work: a cache is shared per-origin and survives logout, so a
 *    denylist ("cache everything except /api/") would silently start caching any
 *    user-specific same-origin response the moment one appears, and replay it
 *    later. Vouching for each URL by name means that cannot happen by accident.
 *    The cost is stated plainly: only what is listed here works offline.
 * ───────────────────────────────────────────────────────────────────────────
 * MAINTENANCE — two knobs, both checked by `check-shell.ps1`:
 *   · bump VERSION whenever a file in SHELL changes. A new value installs a new
 *     worker, precaches into a new cache, and `activate` deletes the previous
 *     one, so a deploy replaces the offline bundle atomically.
 *   · add any new shell file to SHELL as well as to index.html. Forgetting this
 *     breaks OFFLINE boot only, which is easy to miss — hence the check script.
 */
'use strict';

const VERSION = 'v4';
const CACHE = 'nexora-shell-' + VERSION;

/* The app shell: everything needed to boot offline. Relative URLs, so the
 * worker works from a sub-path deploy as well as from the site root.
 *
 * NOTE on '/': on Vercel this is index.html. The local dev server
 * (server-preview.ps1) maps it to preview.html instead, so in dev this entry
 * caches the generated single-file build. Harmless — same app, same origin.
 */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/cloud.js',
  './js/calculations.js',
  './js/platform.js',
  './js/app.js',
  './vendor/html2pdf.bundle.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/exceljs.min.js',
  './vendor/supabase.js',
  './vendor/fonts/fonts.css',
  './vendor/background.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

/* Prefix rules for files the shell references but does not enumerate: the
 * woff2 subsets are pulled in by fonts.css and only the faces actually used get
 * fetched, so they are cached on demand rather than precached. They must still
 * work offline — the print templates wait for these faces before painting, and
 * a fallback face shifts every metric in a generated PDF. */
const RUNTIME_PREFIXES = ['/vendor/fonts/'];

const SHELL_PATHS = new Set(SHELL.map(toPath).concat(['/']));

function toPath(url) {
  try {
    return new URL(url, self.location.href).pathname;
  } catch (e) {
    return url;
  }
}

function isCacheable(pathname) {
  if (SHELL_PATHS.has(pathname)) return true;
  for (let i = 0; i < RUNTIME_PREFIXES.length; i++) {
    if (pathname.indexOf(RUNTIME_PREFIXES[i]) === 0) return true;
  }
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Per-entry, NOT cache.addAll(): addAll is atomic, so one 404 would abort
    // the whole install and leave the app with no worker at all. Missing or
    // optional files simply get retried by the runtime handler below.
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        /* optional asset — not fatal */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.indexOf('nexora-shell-') === 0 && k !== CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never participate in non-GET traffic (POST /api/send-code.js, Supabase
  // writes, form submits). Letting these through untouched is also what keeps
  // auth and cloud sync honest.
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Cross-origin: Supabase (auth + REST), the CDN fallbacks, Google Fonts —
  // none of it is ours to cache or to intercept.
  if (url.origin !== self.location.origin) return;

  // Our one serverless function must always be live.
  if (url.pathname.indexOf('/api/') === 0) return;

  // RULE 2: anything not explicitly vouched for is none of our business. No
  // interception at all — the request behaves exactly as if there were no
  // worker, and nothing about it is ever stored.
  if (!isCacheable(url.pathname)) return;

  event.respondWith(networkFirst(req, url.pathname));
});

async function networkFirst(req, pathname) {
  let cache;
  try {
    cache = await caches.open(CACHE);
  } catch (e) {
    return fetch(req); // storage unavailable (private mode, quota) — stay transparent
  }

  try {
    const fresh = await fetch(req);
    // Only cache our own, successful, complete responses for allowlisted URLs.
    // `type === 'basic'` excludes opaque/redirected responses we have no
    // business storing; the pathname check is belt-and-braces for RULE 2.
    if (fresh && fresh.ok && fresh.type === 'basic' && isCacheable(pathname)) {
      const copy = fresh.clone();
      cache.put(req, copy).catch(() => { /* quota — harmless, just no offline copy */ });
    }
    return fresh;
  } catch (err) {
    // Offline (or the request failed): fall back to the last good copy.
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    // An allowlisted navigation (e.g. '/index.html?x=1', or '/' on a host that
    // maps it to index.html) still gets the app shell: this app is one document
    // with hash routing, so any of its routes boots the same shell.
    if (req.mode === 'navigate' || req.destination === 'document') {
      const shell =
        (await cache.match('./index.html', { ignoreSearch: true })) ||
        (await cache.match('./', { ignoreSearch: true }));
      if (shell) return shell;
    }

    throw err; // nothing cached: surface the real network error
  }
}
