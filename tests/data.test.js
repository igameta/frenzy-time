import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDataSource } from '../src/data.js';
import config from '../config.js';

const schedule = await readFile(new URL('../data/schedule.csv', import.meta.url), 'utf8');
const djs = await readFile(new URL('../data/djs.csv', import.meta.url), 'utf8');
test('片方のCSVが壊れたときは両方とも前の正常データを保持する', async () => {
  let broken = false;
  const source = createDataSource(config, { fetch: async url => new Response(url.endsWith('schedule.csv') ? schedule : broken ? 'name\nbroken' : djs, { headers: { 'Content-Type': 'text/csv' } }) });
  const first = await source.refresh();
  assert.equal(first.error, null);
  broken = true;
  const second = await source.refresh();
  assert.ok(second.error); assert.equal(second.data, first.data); assert.equal(second.updated, first.updated);
});
test('接続エラー時に検証済みのキャッシュを復元する', async () => {
  const store = new Map(), storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  const first = createDataSource(config, { storage, fetch: async url => new Response(url.endsWith('schedule.csv') ? schedule : djs) });
  await first.refresh();
  const second = createDataSource(config, { storage, fetch: async () => { throw new Error('offline'); } });
  assert.equal(second.snapshot.data.slots.length, 18);
  const result = await second.refresh();
  assert.equal(result.error, 'offline'); assert.equal(result.data.slots.length, 18);
});
test('本番モードでは接続失敗時にサンプルデータへ差し替えない', async () => {
  const source = createDataSource({ ...config, data: { useSampleData: false, scheduleUrl: '', djsUrl: '' } }, { fetch: async () => assert.fail('Should not fetch missing URL') });
  const result = await source.refresh();
  assert.equal(result.data, null); assert.ok(result.error);
});
test('公開設定ミスで返されたHTMLをCSVとして使わない', async () => {
  const source = createDataSource(config, { fetch: async () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }) });
  const result = await source.refresh();
  assert.equal(result.data, null); assert.match(result.error, /HTML/);
});
