import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeData, parseCSV, parseDJCredit, parseDateTime, eventPhase, eventDays, slotsForDay, lineup, activeDay, previewTime } from '../src/model.js';
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
  assert.equal(modified.slots[0].displayName, 'DJ AO');
  assert.deepEqual(modified.slots[0].djNames, ['DJ AO']);
  assert.throws(() => normalizeData(schedule, djs + '\nDJ AO,genre,bio,,,', config.floors), /重複/);
  assert.throws(() => normalizeData(schedule.replace('DJ AO', 'dj ao'), djs, config.floors), /見つかりません/);
});

test('B2B名義を表示名と参加DJに分け、3人以上にも対応する', () => {
  assert.deepEqual(parseDJCredit(' AO B2B Nagi ( DJ AO , Nagi ) '), { displayName: 'AO B2B Nagi', djNames: ['DJ AO', 'Nagi'] });
  const modified = normalizeData(schedule.replace('DJ AO', '"夜更かしクルー (DJ AO,Nagi,Mizuki)"'), djs, config.floors);
  assert.equal(modified.slots[0].displayName, '夜更かしクルー');
  assert.deepEqual(modified.slots[0].djNames, ['DJ AO', 'Nagi', 'Mizuki']);
  assert.equal(modified.slots.length, data.slots.length);
  assert.equal(modified.djs.get('Nagi').favoriteTrackUrl, 'https://soundcloud.com/forss/flickermood');
  assert.throws(() => normalizeData(schedule.replace('DJ AO', '"B2B (DJ AO,Unknown)"'), djs, config.floors), /プロフィールが見つかりません：Unknown/);
});

test('任意列なしでもB2B名義だけを表示名として抽出し、個別DJに紐付ける', () => {
  const minimalSchedule = 'floor_id,start_at,end_at,dj_name\nfloor-1,2027-11-06T13:00:00+09:00,2027-11-06T13:30:00+09:00,"夜更かしクルー (DJ AO,Nagi)"';
  const minimalProfiles = 'name,genres,profile\nDJ AO,House,bio AO\nNagi,Techno,bio Nagi';
  const result = normalizeData(minimalSchedule, minimalProfiles, config.floors);
  assert.equal(result.slots[0].displayName, '夜更かしクルー');
  assert.deepEqual(result.slots[0].djNames, ['DJ AO', 'Nagi']);
  assert.ok(!result.djs.has('夜更かしクルー'));
  assert.ok(result.slots[0].id);
  for (const dj of result.djs.values()) {
    assert.equal(dj.imageUrl, '');
    assert.equal(dj.linkUrl, '');
    assert.equal(dj.favoriteTrackUrl, '');
  }
  const withBlankId = minimalSchedule.split('\n').map((line, index) => `${index === 0 ? 'slot_id' : ''},${line}`).join('\n');
  assert.equal(normalizeData(withBlankId, minimalProfiles, config.floors).slots[0].id, result.slots[0].id);
  const withBlankUrls = minimalProfiles.split('\n').map((line, index) => `${line}${index === 0 ? ',image_url,link_url,favorite_track_url' : ',,,'}`).join('\n');
  assert.deepEqual(normalizeData(minimalSchedule, withBlankUrls, config.floors), result);
});

test('B2B名義自身のプロフィールを個別DJと併存させ、名義を最初に表示する', () => {
  const groupSchedule = schedule.replace('DJ AO', '"夜更かしクルー (DJ AO,Nagi)"');
  const groupProfiles = djs + '\n夜更かしクルー,B2B House,名義自身のプロフィール,https://example.com/group.jpg,https://example.com/group,https://soundcloud.com/forss/flickermood';
  const result = normalizeData(groupSchedule, groupProfiles, config.floors);
  const slot = result.slots[0];
  assert.deepEqual(slot.djNames, ['DJ AO', 'Nagi']);
  assert.deepEqual(slot.profileNames, ['夜更かしクルー', 'DJ AO', 'Nagi']);
  const group = result.djs.get(slot.profileNames[0]);
  assert.equal(group.genres, 'B2B House');
  assert.equal(group.profile, '名義自身のプロフィール');
  assert.equal(group.imageUrl, 'https://example.com/group.jpg');
  assert.equal(group.linkUrl, 'https://example.com/group');
  assert.equal(group.favoriteTrackUrl, 'https://soundcloud.com/forss/flickermood');
  assert.notEqual(group.profile, result.djs.get('DJ AO').profile);
  assert.deepEqual(normalizeData(groupSchedule, djs, config.floors).slots[0].profileNames, ['DJ AO', 'Nagi']);
  assert.deepEqual(data.slots[0].profileNames, ['DJ AO']);
});

test('プロフィール側のnameが参加者付きB2B表記でも名義自身の情報を照合する', () => {
  const liveSchedule = 'floor_id,start_at,end_at,dj_name\nfloor-1,2027-11-07T14:45:00+09:00,2027-11-07T14:50:00+09:00,"わくわくぽえぽえ(M2B2-A,poe)"';
  const profiles = 'name,genres,profile\nM2B2-A,Remix,個人A\npoe,EDM,個人B\n"わくわくぽえぽえ(M2B2-A,poe)",B2B,名義自身のプロフィール\nXenofy(ぜのふぃ),House,通常のDJネーム';
  const result = normalizeData(liveSchedule, profiles, config.floors);
  assert.equal(result.slots[0].displayName, 'わくわくぽえぽえ');
  assert.deepEqual(result.slots[0].profileNames, ['わくわくぽえぽえ', 'M2B2-A', 'poe']);
  assert.equal(result.djs.get('わくわくぽえぽえ').name, 'わくわくぽえぽえ');
  assert.equal(result.djs.get('わくわくぽえぽえ').profile, '名義自身のプロフィール');
  assert.equal(result.djs.get('M2B2-A').profile, '個人A');
  assert.ok(result.djs.has('Xenofy(ぜのふぃ)'));
  assert.ok(!result.djs.has('わくわくぽえぽえ(M2B2-A,poe)'));
  const spaced = profiles.replace('わくわくぽえぽえ(M2B2-A,poe)', 'わくわくぽえぽえ ( M2B2-A , poe )');
  assert.deepEqual(normalizeData(liveSchedule, spaced, config.floors), result);
  assert.throws(() => normalizeData(liveSchedule, profiles + '\nわくわくぽえぽえ,B2B,重複する名義', config.floors), /重複/);
});

test('自動IDはフロアと開始日時で決まり、重複する枠は拒否する', () => {
  const headers = 'floor_id,start_at,end_at,dj_name';
  const row = 'floor-1,2027-11-06T13:00:00+09:00,2027-11-06T13:30:00+09:00,DJ AO';
  const original = normalizeData(`${headers}\n${row}`, djs, config.floors).slots[0];
  const equivalent = row.replace('2027-11-06T13:00:00+09:00', '2027-11-06T04:00:00Z').replace('DJ AO', 'Nagi');
  assert.equal(normalizeData(`${headers}\n${equivalent}`, djs, config.floors).slots[0].id, original.id);
  const nextDay = row.replaceAll('2027-11-06', '2027-11-07');
  const otherFloor = row.replace('floor-1', 'floor-2');
  const result = normalizeData(`${headers}\n${nextDay}\n${row}\n${otherFloor}`, djs, config.floors);
  assert.equal(new Set(result.slots.map(slot => slot.id)).size, 3);
  assert.throws(() => normalizeData(`${headers}\n${row}\n${equivalent}`, djs, config.floors), /重複/);
});

test('括弧・カンマ・バックスラッシュをエスケープできる', () => {
  assert.deepEqual(parseDJCredit(String.raw`DJ AO \(Guest\)`), { displayName: 'DJ AO (Guest)', djNames: ['DJ AO (Guest)'] });
  assert.deepEqual(parseDJCredit(String.raw`Special \(B2B\) (DJ AO \(Guest\),A\,B,C\\D)`), {
    displayName: 'Special (B2B)', djNames: ['DJ AO (Guest)', 'A,B', 'C\\D'],
  });
  const names = 'name,genres,profile\nDJ AO (Guest),House,bio\n"A,B",Techno,bio\n';
  const modified = normalizeData(schedule.split('\n').slice(0, 2).join('\n').replace('DJ AO', String.raw`"Special \(B2B\) (DJ AO \(Guest\),A\,B)"`), names, config.floors);
  assert.deepEqual(modified.slots[0].djNames, ['DJ AO (Guest)', 'A,B']);
  assert.ok(modified.djs.has(modified.slots[0].djNames[1]));
});

test('scheduleとdjsの両方にエスケープがあっても個人・B2B名義を照合する', () => {
  const liveSchedule = 'floor_id,start_at,end_at,dj_name\n' +
    String.raw`floor-1,2026-11-01T10:00:00+09:00,2026-11-01T10:30:00+09:00,M2B2-A\(松葉杖\)` + '\n' +
    String.raw`floor-1,2026-11-01T10:30:00+09:00,2026-11-01T11:00:00+09:00,"わくわくぽえぽえ(M2B2-A\(松葉杖\),poe)"`;
  const profiles = 'name,genres,profile\n' +
    String.raw`M2B2-A\(松葉杖\),Remix,個人A` + '\npoe,EDM,個人B\n' +
    String.raw`"わくわくぽえぽえ(M2B2-A\(松葉杖\),poe)",B2B,名義プロフィール`;
  const result = normalizeData(liveSchedule, profiles, config.floors);
  assert.deepEqual(result.slots[0].djNames, ['M2B2-A(松葉杖)']);
  assert.deepEqual(result.slots[1].profileNames, ['わくわくぽえぽえ', 'M2B2-A(松葉杖)', 'poe']);
  assert.equal(result.djs.get('M2B2-A(松葉杖)').profile, '個人A');
  assert.equal(result.djs.get('わくわくぽえぽえ').profile, '名義プロフィール');
  assert.throws(() => normalizeData(liveSchedule, profiles + '\nM2B2-A(松葉杖),Remix,二重登録', config.floors), /重複/);
});

test('プロフィールのリテラル名が一致する場合はバックスラッシュも含めて優先する', () => {
  const liveSchedule = 'floor_id,start_at,end_at,dj_name\n' +
    String.raw`floor-1,2026-11-01T10:00:00+09:00,2026-11-01T10:30:00+09:00,C\\D`;
  const profiles = 'name,genres,profile\n' + String.raw`C\D,House,元の名前`;
  const result = normalizeData(liveSchedule, profiles, config.floors);
  assert.equal(result.djs.get(String.raw`C\D`).profile, '元の名前');
});

test('不正な名義記法・空の参加者・同一枠のDJ重複を拒否する', () => {
  for (const value of ['', 'B2B ()', 'B2B (DJ AO,)', 'B2B (,Nagi)', '(DJ AO,Nagi)', 'B2B (DJ AO,Nagi', 'B2B DJ AO,Nagi)', 'B2B (DJ AO,Nagi) extra', 'B2B ((DJ AO),Nagi)', 'DJ AO\\', String.raw`DJ \q`]) {
    assert.throws(() => parseDJCredit(value), undefined, value);
  }
  assert.throws(() => parseDJCredit('B2B (DJ AO, DJ AO)'), /重複/);
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
  assert.equal(result.current.displayName, 'Nagi'); assert.equal(result.previous, null);
  result = lineup(slots, at('13:30'));
  assert.equal(result.previous.displayName, 'Nagi'); assert.equal(result.current.displayName, 'DJ AO'); assert.equal(result.next.displayName, 'Kite');
  result = lineup(slots, at('16:00'));
  assert.equal(result.current, null); assert.equal(result.previous.displayName, 'Haru'); assert.equal(result.next, null);
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

test('開発プレビューの3状態が予定期間に対応し、期間外の確認用日時を使わない', () => {
  assert.equal(eventPhase(data.slots, previewTime(data.slots, 'before')), 'before');
  assert.equal(eventPhase(data.slots, previewTime(data.slots, 'after')), 'after');
  for (const reference of [undefined, 'invalid', '2000-01-01T00:00:00Z', '2099-01-01T00:00:00Z']) {
    const timestamp = previewTime(data.slots, 'during', reference);
    assert.equal(eventPhase(data.slots, timestamp), 'during');
    assert.ok(data.slots.some(slot => slot.start <= timestamp && timestamp < slot.end));
  }
  const reference = '2027-11-07T13:45:00+09:00';
  assert.equal(previewTime(data.slots, 'during', reference), Date.parse(reference));
  const short = [{ start: 0, end: 30_000 }];
  assert.ok(previewTime(short, 'during') < short[0].end);
  assert.equal(previewTime([], 'during'), null);
});
test('旧slot_id列は値の有無・重複にかかわらず無視する', () => {
  const legacy = schedule.trim().split('\n').map((line, index) => `${index === 0 ? 'slot_id' : index % 2 ? 'same-id' : ''},${line}`).join('\n');
  assert.deepEqual(normalizeData(legacy, djs, config.floors), data);
});

test('不正な日時・フロア・重複する出演枠を拒否する', () => {
  assert.throws(() => parseDateTime('2027-11-07T13:00'), /ISO/);
  assert.throws(() => parseDateTime('2027-02-30T13:00:00+09:00'), /不正/);
  assert.throws(() => normalizeData(schedule.replace('floor-1', 'unknown'), djs, config.floors), /未定義/);
  assert.throws(() => normalizeData(schedule + '\n' + schedule.split('\n')[1], djs, config.floors), /フロアと開始日時が重複/);
  assert.throws(() => normalizeData(schedule.replace('2027-11-06T13:30:00+09:00,2027-11-06T14:00:00+09:00', '2027-11-06T13:20:00+09:00,2027-11-06T14:00:00+09:00'), djs, config.floors), /重複/);
});
