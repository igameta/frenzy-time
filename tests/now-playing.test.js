import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../src/model.js';
import { currentPerformance, renderNowPlaying } from '../src/now-playing-view.js';

const floors = [{ id: 'floor-1' }, { id: 'floor-2' }];
const schedule = `floor_id,start_at,end_at,dj_name
floor-1,2026-10-31T10:00:00+09:00,2026-10-31T10:30:00+09:00,DJ A
floor-1,2026-10-31T10:30:00+09:00,2026-10-31T11:00:00+09:00,"Crew (DJ A,DJ B)"
floor-1,2026-10-31T11:10:00+09:00,2026-10-31T11:30:00+09:00,DJ B
floor-2,2026-10-31T10:00:00+09:00,2026-10-31T11:00:00+09:00,DJ B
floor-1,2026-11-01T23:30:00+09:00,2026-11-02T00:30:00+09:00,DJ A`;
const profiles = `name,genres,profile,image_url
DJ A,House,紹介A,
DJ B,Techno,紹介B,https://images.example/b.jpg`;
const data = normalizeData(schedule, profiles, floors);
const at = value => Date.parse(`2026-10-31T${value}+09:00`);
const options = { eventName: 'TDU RAVE2026', floorName: 'メインステージ', base: 'https://event.example/' };

test('Now Playingはフロアで絞り、開始時刻を含み終了時刻で次のDJに切り替える', () => {
  assert.equal(currentPerformance(data, 'floor-1', at('09:59:59')), null);
  assert.equal(currentPerformance(data, 'floor-1', at('10:00:00')).slot.displayName, 'DJ A');
  assert.equal(currentPerformance(data, 'floor-2', at('10:00:00')).slot.displayName, 'DJ B');
  assert.equal(currentPerformance(data, 'floor-1', at('10:29:59')).slot.displayName, 'DJ A');
  assert.equal(currentPerformance(data, 'floor-1', at('10:30:00')).slot.displayName, 'Crew');
  assert.equal(currentPerformance(data, 'floor-1', at('11:00:00')), null);
  assert.equal(currentPerformance(data, 'floor-1', at('11:09:59')), null);
  assert.equal(currentPerformance(data, 'floor-1', at('11:10:00')).slot.displayName, 'DJ B');
  assert.equal(currentPerformance(data, 'floor-1', at('11:30:00')), null);
});

test('開催日外は非表示にし、日付をまたぐ出演枠は継続する', () => {
  assert.equal(currentPerformance(data, 'floor-1', Date.parse('2026-11-01T10:00:00+09:00')), null);
  assert.equal(currentPerformance(data, 'floor-1', Date.parse('2026-11-02T00:00:00+09:00')).slot.displayName, 'DJ A');
  assert.equal(currentPerformance(data, 'floor-1', Date.parse('2026-11-02T00:30:00+09:00')), null);
  assert.equal(currentPerformance(data, 'unknown', at('10:00:00')), null);
  assert.equal(currentPerformance(null, 'floor-1', at('10:00:00')), null);
  assert.equal(renderNowPlaying(null, options), '');
});

test('B2Bは名義のみを見出しにし、名義の画像がない場合に参加DJの画像とジャンルを使用する', () => {
  const performance = currentPerformance(data, 'floor-1', at('10:30:00'));
  const html = renderNowPlaying(performance, options);
  assert.ok(html.includes('<h1 class="now-name">Crew</h1>'));
  assert.ok(!html.includes('Crew (DJ A,DJ B)'));
  assert.ok(html.includes('artist-collage'));
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.ok(html.includes('House / Techno'));
  assert.ok(html.includes('>10:30</time>–<time'));
  assert.ok(html.includes('>11:00</time>'));
});

test('B2B名義自身の情報を優先し、設定やプロフィールのHTMLをエスケープする', () => {
  const withAct = normalizeData(schedule, `${profiles}\nCrew,House & Garage,紹介,https://images.example/crew.jpg`, floors);
  const performance = currentPerformance(withAct, 'floor-1', at('10:30:00'));
  const html = renderNowPlaying(performance, { ...options, eventName: '<script>event</script>', floorName: 'A & B' });
  assert.ok(html.includes('https://images.example/crew.jpg'));
  assert.ok(!html.includes('artist-collage'));
  assert.ok(html.includes('House &amp; Garage'));
  assert.ok(html.includes('&lt;script&gt;event&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('<script>'));
});
