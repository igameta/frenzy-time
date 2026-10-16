export function parseCSV(text) {
  const input = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',' || c === '\r' || c === '\n') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') {
        if (c === '\r' && input[i + 1] === '\n') i++;
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
      }
    } else if (c === '"') {
      if (cell || closed) throw new Error('CSVの引用符が不正です。');
      quoted = true;
    } else {
      if (closed) throw new Error('CSVの引用符の後に不正な文字があります。');
      cell += c;
    }
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  if (!rows.length) throw new Error('CSVが空です。');
  const headers = rows.shift().map(value => value.trim());
  if (headers.some(value => !value) || new Set(headers).size !== headers.length) {
    throw new Error('CSVのヘッダーに空欄または重複があります。');
  }
  return { headers, rows: rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSVの${i + 2}行目の列数が一致しません。`);
    return Object.fromEntries(headers.map((header, j) => [header, values[j].trim()]));
  }) };
}

function requireColumns(csv, columns, label) {
  const missing = columns.filter(column => !csv.headers.includes(column));
  if (missing.length) throw new Error(`${label}の必須列がありません：${missing.join(', ')}`);
}

export function parseDateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`日時はタイムゾーン付きISO 8601形式で入力してください：${value}`);
  }
  const timestamp = Date.parse(value);
  const [date, clock] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(timestamp) || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || Number(clock.slice(0, 2)) > 23 || Number(clock.slice(3, 5)) > 59 || (clock[5] === ':' && Number(clock.slice(6, 8)) > 59)) {
    throw new Error(`日時が不正です：${value}`);
  }
  return timestamp;
}

export function normalizeData(scheduleCSV, djsCSV, floors) {
  const schedules = parseCSV(scheduleCSV), profiles = parseCSV(djsCSV);
  requireColumns(schedules, ['slot_id', 'floor_id', 'start_at', 'end_at', 'dj_name'], 'タイムテーブル');
  requireColumns(profiles, ['name', 'genres', 'profile'], 'DJプロフィール');
  const djs = new Map();
  for (const row of profiles.rows) {
    if (!row.name || djs.has(row.name)) throw new Error(`DJネームが空欄または重複しています：${row.name}`);
    djs.set(row.name, {
      name: row.name, genres: row.genres, profile: row.profile,
      imageUrl: row.image_url || '', linkUrl: row.link_url || '',
      favoriteTrackUrl: row.favorite_track_url || row['推し曲'] || '',
    });
  }
  const floorIds = new Set(floors.map(floor => floor.id)), slotIds = new Set();
  const slots = schedules.rows.map(row => {
    if (!row.slot_id || slotIds.has(row.slot_id)) throw new Error(`slot_idが空欄または重複しています：${row.slot_id}`);
    slotIds.add(row.slot_id);
    if (!floorIds.has(row.floor_id)) throw new Error(`未定義のフロアです：${row.floor_id}`);
    if (!djs.has(row.dj_name)) throw new Error(`プロフィールが見つかりません：${row.dj_name}`);
    const start = parseDateTime(row.start_at), end = parseDateTime(row.end_at);
    if (end <= start) throw new Error(`終了時刻が開始時刻以前です：${row.slot_id}`);
    return { id: row.slot_id, floorId: row.floor_id, djName: row.dj_name, start, end };
  }).sort((a, b) => a.start - b.start || a.floorId.localeCompare(b.floorId));
  if (!slots.length) throw new Error('出演枠がありません。');
  for (const floor of floors) {
    const list = slots.filter(slot => slot.floorId === floor.id);
    for (let i = 1; i < list.length; i++) {
      if (list[i].start < list[i - 1].end) throw new Error(`同じフロアの出演時刻が重複しています：${list[i].id}`);
    }
  }
  return { slots, djs };
}

export function dateKey(timestamp, timeZone = 'Asia/Tokyo') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function eventDays(slots, timeZone = 'Asia/Tokyo') {
  return [...new Set(slots.map(slot => dateKey(slot.start, timeZone)))];
}

export function slotsForDay(slots, day, floorId, timeZone = 'Asia/Tokyo') {
  return slots.filter(slot => dateKey(slot.start, timeZone) === day && (!floorId || slot.floorId === floorId));
}

export function activeDay(slots, now, timeZone = 'Asia/Tokyo') {
  const current = slots.find(slot => slot.start <= now && now < slot.end);
  if (current) return dateKey(current.start, timeZone);
  const today = dateKey(now, timeZone), days = eventDays(slots, timeZone);
  if (days.includes(today)) return today;
  return days.find(day => day > today) || days.at(-1);
}

export function eventPhase(slots, now) {
  if (now < slots[0].start) return 'before';
  return now >= Math.max(...slots.map(slot => slot.end)) ? 'after' : 'during';
}

// 開始は含み、終了は含まない。休憩中でも直前のDJを残す。
export function lineup(slots, now) {
  const current = slots.find(slot => slot.start <= now && now < slot.end) || null;
  const previous = slots.filter(slot => slot.end <= now).at(-1) || null;
  const next = slots.find(slot => slot.start > now) || null;
  return { previous, current, next };
}

export function previewTime(slots, mode, reference) {
  if (mode === 'before') return slots[0].start - 86_400_000;
  if (mode === 'after') return Math.max(...slots.map(slot => slot.end)) + 60_000;
  if (mode === 'during') return Number.isFinite(Date.parse(reference)) ? Date.parse(reference) : slots[0].start + 60_000;
  return null;
}
