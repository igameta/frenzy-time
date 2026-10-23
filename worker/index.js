import config from '../config.js';
import { parseCSV } from '../src/model.js';

const endpoints = {
  '/api/schedule.csv': { setting: 'scheduleUrl', file: '/data/schedule.csv', columns: ['floor_id', 'start_at', 'end_at', 'dj_name'] },
  '/api/djs.csv': { setting: 'djsUrl', file: '/data/djs.csv', columns: ['name', 'genres', 'profile'] },
};

function reply(request, response, status) {
  const headers = new Headers(response.headers);
  // ブラウザーには保存させず、WorkerのCache APIだけでTTLを管理する。
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (status) headers.set('X-Data-Cache', status);
  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
}

export function createWorker(siteConfig = config, dependencies = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const endpoint = Object.hasOwn(endpoints, url.pathname) ? endpoints[url.pathname] : null;
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (!endpoint) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      if (!['GET', 'HEAD'].includes(request.method)) {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
      }
      if (siteConfig.data.useSampleData) {
        const asset = await env.ASSETS.fetch(new Request(new URL(endpoint.file, url), { method: request.method }));
        return reply(request, asset, 'SAMPLE');
      }

      let upstream;
      try {
        upstream = new URL(siteConfig.data[endpoint.setting]);
        if (upstream.protocol !== 'https:' || upstream.username || upstream.password) throw new Error('Invalid source');
      } catch {
        return new Response('公開CSVのURL設定が不正です。', { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }
      // 呼び出し側のクエリは無視する。取得先変更時は古いキャッシュと区別する。
      const keyURL = new URL(url.pathname, url.origin);
      keyURL.searchParams.set('source', upstream.href);
      const key = new Request(keyURL);
      const cache = dependencies.cache || globalThis.caches.default;
      const requestUpstream = dependencies.fetch || globalThis.fetch;
      let cached;
      try { cached = await cache.match(key); } catch { /* キャッシュ障害時も取得は継続する。 */ }
      if (cached) return reply(request, cached, 'HIT');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await requestUpstream(upstream.href, {
          signal: controller.signal, headers: { Accept: 'text/csv' }, redirect: 'follow',
        });
        if (!response.ok || (response.headers.get('Content-Type') || '').includes('text/html')) throw new Error('Invalid upstream response');
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) throw new Error('CSV too large');
        const csv = parseCSV(text);
        if (endpoint.columns.some(column => !csv.headers.includes(column))) throw new Error('Missing columns');
        const configuredTTL = Number(env.CSV_CACHE_TTL_SECONDS ?? 120);
        const ttl = Number.isSafeInteger(configuredTTL) && configuredTTL > 0 ? configuredTTL : 120;
        // 上流のCookieやキャッシュ制御は引き継がない。正常なCSVのみ保存する。
        const result = new Response(text, { headers: {
          'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}`,
        } });
        try { await cache.put(key, result.clone()); } catch { /* 保存できない場合も正常データを返す。 */ }
        return reply(request, result, 'MISS');
      } catch {
        return new Response('公開CSVを取得できませんでした。時間をおいて再読み込みしてください。', {
          status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export default createWorker();
