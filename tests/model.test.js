import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeData, parseCSV, parseDateTime, eventPhase, eventDays, slotsForDay, lineup, activeDay } from '../src/model.js';
import config from '../config.js';

const schedule = await readFile(new URL('../data/schedule.csv', import.meta.url), 'utf8');
const djs = await readFile(new URL('../data/djs.csv', import.meta.url), 'utf8');
const data = normalizeData(schedule, djs, config.floors);
const at = value => Date.parse(`2027-11-07T${value}:00+09:00`);

test('CSV: BOM・改行・カンマ・引用符を含むプロフィールを保持する', () => {
  const parsed = parseCSV('\uFEFFname,profile\r\n"Nagi","a,b\n""music"""\r\n');
  assert.deepEqual(parsed.rows, [{ name: 'Nagi', profile: 'a,b\n"music"' }]);
  assert.throws(() => parseCSV('a,a\n1,2'), /ヘッダー/);
  assert.throws(() => parseCSV('a,b\n"not closed'), /閉じ/);
  assert.throws(() => parseCSV('a,b\n1,2,3'), /列数/);
  assert.throws(() => parseCSV('a\n"value"x'), /不正/);
});
test('DJ名のtrim・完全一致をキーにする', () => {
  const modified = normalizeData(schedule.replace('DJ AO', ' DJ AO '), djs, config.floors);
  assert.equal(modified.slots[0].djName, 'DJ AO');
  assert.throws(() => normalizeData(schedule, djs + '\nDJ AO,genre,bio,,,', config.floors), /重複/);
  assert.throws(() => normalizeData(schedule.replace('DJ AO', 'dj ao'), djs, config.floors), /見つかりません/);
});
test('1フロアの日と2フロアの日をデータから決める', () => {
  assert.equal(data.slots.length, 18);
  assert.deepEqual(eventDays(data.slots), ['2027-11-06', '2027-11-07']);
  assert.equal(slotsForDay(data.slots, '2027-11-06', 'floor-2').length, 0);
  assert.equal(slotsForDay(data.slots, '2027-11-07', 'floor-2').length, 6);
});
test('予定切替の境界で直前のDJと次のDJを保持する', () => {
  const slots = slotsForDay(data.slots, '2027-11-07', 'floor-1');
  let result = lineup(slots, at('13:29'));
  assert.equal(result.current.djName, 'Nagi'); assert.equal(result.previous, null);
  result = lineup(slots, at('13:30'));
  assert.equal(result.previous.djName, 'Nagi'); assert.equal(result.current.djName, 'DJ AO'); assert.equal(result.next.djName, 'Kite');
  result = lineup(slots, at('16:00'));
  assert.equal(result.current, null); assert.equal(result.previous.djName, 'Haru'); assert.equal(result.next, null);
});
test('休憩中に存在しない現在DJを作らない', () => {
  const list = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 20, end: 30 }];
  assert.deepEqual(lineup(list, 15), { previous: list[0], current: null, next: list[1] });
});
test('初回開演と最終終演で表示状態が変わる', () => {
  assert.equal(eventPhase(data.slots, data.slots[0].start - 1), 'before');
  assert.equal(eventPhase(data.slots, data.slots[0].start), 'during');
  assert.equal(eventPhase(data.slots, at('16:00')), 'after');
  assert.equal(activeDay(data.slots, at('00:00')), '2027-11-07');
});
test('不正な日時・フロア・slot_id・重複する出演枠を拒否する', () => {
  assert.throws(() => parseDateTime('2027-11-07T13:00'), /ISO/);
  assert.throws(() => parseDateTime('2027-02-30T13:00:00+09:00'), /不正/);
  assert.throws(() => normalizeData(schedule.replace('floor-1', 'unknown'), djs, config.floors), /未定義/);
  assert.throws(() => normalizeData(schedule + '\n' + schedule.split('\n')[1], djs, config.floors), /slot_id/);
  assert.throws(() => normalizeData(schedule.replace('2027-11-06T13:30:00+09:00,2027-11-06T14:00:00+09:00', '2027-11-06T13:20:00+09:00,2027-11-06T14:00:00+09:00'), djs, config.floors), /重複/);
});
