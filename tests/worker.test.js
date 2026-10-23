import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/index.js';

const config = { data: { useSampleData: false,
  scheduleUrl: 'https://example.com/schedule.csv', djsUrl: 'https://example.com/djs.csv',
} };
const schedule = 'floor_id,start_at,end_at,dj_name\nmain,2026-11-01T12:00+09:00,2026-11-01T13:00+09:00,DJ';
const djs = 'name,genres,profile\nDJ,House,Hello';
const env = { CSV_CACHE_TTL_SECONDS: '120', ASSETS: { fetch: async () => new Response('asset') } };
const request = (path = '/api/schedule.csv', method = 'GET') => new Request(`https://event.example${path}`, { method });

function cacheFixture() {
  const store = new Map();
  let now = 0;
  return { store, advance: seconds => { now += seconds; },
    async match(key) {
      const entry = store.get(key.url);
      return entry && entry.expires > now ? entry.response.clone() : undefined;
    },
    async put(key, response) {
      const ttl = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control'))[1]);
      store.set(key.url, { response: response.clone(), expires: now + ttl });
    },
  };
}

test('CSVを120秒共有し、期限切れ後に再取得する。呼び出し側のクエリでは取得先を変えない', async () => {
  const cache = cacheFixture(), calls = [];
  const worker = createWorker(config, { cache, fetch: async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Accept, 'text/csv');
    return new Response(schedule, { headers: { 'Content-Type': 'text/csv', 'Set-Cookie': 'upstream=private' } });
  } });
  const first = await worker.fetch(request(), env);
  assert.equal(first.headers.get('X-Data-Cache'), 'MISS');
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.equal(first.headers.get('Set-Cookie'), null);
  assert.equal(await first.text(), schedule);
  assert.equal((await worker.fetch(request('/api/schedule.csv?url=https://other.example/evil'), env)).headers.get('X-Data-Cache'), 'HIT');
  assert.equal(calls.length, 1);
  cache.advance(120);
  assert.equal((await worker.fetch(request(), env)).headers.get('X-Data-Cache'), 'MISS');
  assert.deepEqual(calls, [config.data.scheduleUrl, config.data.scheduleUrl]);
});

test('DJと予定のキャッシュを分離し、取得元の設定変更でも分離する', async () => {
  const cache = cacheFixture(), calls = [];
  const fetch = async url => { calls.push(url); return new Response(url.includes('djs') ? djs : schedule); };
  const worker = createWorker(config, { cache, fetch });
  await worker.fetch(request(), env);
  assert.equal(await (await worker.fetch(request('/api/djs.csv'), env)).text(), djs);
  const next = createWorker({ data: { ...config.data, scheduleUrl: 'https://example.com/new.csv' } }, { cache, fetch });
  assert.equal((await next.fetch(request(), env)).headers.get('X-Data-Cache'), 'MISS');
  assert.equal(calls.length, 3);
});

test('エラー・HTML・不正CSVを保存しない', async () => {
  for (const response of [new Response('error', { status: 429 }),
    new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('name\nDJ'), new Response('floor_id,start_at,end_at,dj_name\n"broken')]) {
    const cache = cacheFixture();
    const worker = createWorker(config, { cache, fetch: async () => response });
    const result = await worker.fetch(request(), env);
    assert.equal(result.status, 502);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(cache.store.size, 0);
  }
});

test('通信・キャッシュ障害を処理し、TTL設定を反映する', async () => {
  const brokenCache = { match: async () => { throw new Error('cache down'); }, put: async () => { throw new Error('cache down'); } };
  const worker = createWorker(config, { cache: brokenCache, fetch: async () => new Response(schedule) });
  assert.equal((await worker.fetch(request(), env)).status, 200);
  const offline = createWorker(config, { cache: brokenCache, fetch: async () => { throw new Error('offline'); } });
  assert.equal((await offline.fetch(request(), env)).status, 502);
  const cache = cacheFixture();
  const configurable = createWorker(config, { cache, fetch: async () => new Response(schedule) });
  await configurable.fetch(request(), { ...env, CSV_CACHE_TTL_SECONDS: '300' });
  assert.equal([...cache.store.values()][0].response.headers.get('Cache-Control'), 'public, max-age=300');
});

test('GET/HEADのみ許可し、未知APIは404、通常ページは静的ファイルを返す', async () => {
  const worker = createWorker(config, { cache: cacheFixture(), fetch: async () => new Response(schedule) });
  assert.equal(await (await worker.fetch(request('/index.html'), env)).text(), 'asset');
  assert.equal((await worker.fetch(request('/api/unknown'), env)).status, 404);
  const post = await worker.fetch(request('/api/schedule.csv', 'POST'), env);
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
  const head = await worker.fetch(request('/api/schedule.csv', 'HEAD'), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('サンプル設定では外部へ通信せず、設定不正時は503にする', async () => {
  const worker = createWorker({ data: { useSampleData: true } }, { fetch: async () => assert.fail('Must not fetch') });
  let assetURL;
  const sample = await worker.fetch(request(), { ...env, ASSETS: { fetch: async req => { assetURL = req.url; return new Response(schedule); } } });
  assert.equal(assetURL, 'https://event.example/data/schedule.csv');
  assert.equal(sample.headers.get('X-Data-Cache'), 'SAMPLE');
  assert.equal(await sample.text(), schedule);
  const invalid = createWorker({ data: { useSampleData: false, scheduleUrl: 'http://example.com/file.csv' } });
  assert.equal((await invalid.fetch(request(), env)).status, 503);
});
