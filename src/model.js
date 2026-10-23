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

export function parseDJCredit(value) {
  const tokens = [];
  const input = String(value).trim();
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '\\') {
      const next = input[++i];
      if (!next || !'\\(),'.includes(next)) throw new Error(`出演名義のエスケープが不正です：${value}`);
      tokens.push({ char: next, escaped: true });
    } else tokens.push({ char, escaped: false });
  }
  const text = list => list.map(token => token.char).join('').trim();
  const brackets = tokens.map((token, index) => !token.escaped && '()'.includes(token.char) ? index : -1).filter(index => index !== -1);
  if (!brackets.length) {
    const displayName = text(tokens);
    if (!displayName) throw new Error('DJネームが空欄です。');
    return { displayName, djNames: [displayName] };
  }
  if (brackets.length !== 2 || tokens[brackets[0]].char !== '(' || tokens[brackets[1]].char !== ')' || brackets[1] !== tokens.length - 1) {
    throw new Error(`出演名義の括弧が不正です：${value}`);
  }
  const displayName = text(tokens.slice(0, brackets[0]));
  const members = [[]];
  for (const token of tokens.slice(brackets[0] + 1, brackets[1])) {
    if (token.char === ',' && !token.escaped) members.push([]);
    else members.at(-1).push(token);
  }
  const djNames = members.map(text);
  if (!displayName || djNames.some(name => !name)) throw new Error(`出演名義または参加DJが空欄です：${value}`);
  if (new Set(djNames).size !== djNames.length) throw new Error(`同じ出演枠のDJネームが重複しています：${value}`);
  return { displayName, djNames };
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
  requireColumns(schedules, ['floor_id', 'start_at', 'end_at', 'dj_name'], 'タイムテーブル');
  requireColumns(profiles, ['name', 'genres', 'profile'], 'DJプロフィール');
  const credits = schedules.rows.map(row => parseDJCredit(row.dj_name));
  const actNames = new Set(credits.filter(credit => credit.djNames.length > 1).map(credit => credit.displayName));
  const expectedNames = new Set(credits.flatMap(credit => [credit.displayName, ...credit.djNames]));
  const djs = new Map();
  for (const row of profiles.rows) {
    let name = row.name;
    if (!expectedNames.has(name)) {
      try {
        const credit = parseDJCredit(name);
        if ((credit.djNames.length > 1 && actNames.has(credit.displayName)) ||
            (credit.djNames.length === 1 && expectedNames.has(credit.displayName))) name = credit.displayName;
      } catch { /* 通常のDJネームに含まれる括弧などは、そのままキーとして保持する。 */ }
    }
    if (!name || djs.has(name)) throw new Error(`DJネームが空欄または重複しています：${name}`);
    djs.set(name, {
      name, genres: row.genres, profile: row.profile,
      imageUrl: row.image_url || '', linkUrl: row.link_url || '',
      favoriteTrackUrl: row.favorite_track_url || row['推し曲'] || '',
    });
  }
  const floorIds = new Set(floors.map(floor => floor.id)), seenSlots = new Set();
  const slots = schedules.rows.map((row, index) => {
    if (!floorIds.has(row.floor_id)) throw new Error(`未定義のフロアです：${row.floor_id}`);
    const credit = credits[index];
    for (const name of credit.djNames) {
      if (!djs.has(name)) throw new Error(`プロフィールが見つかりません：${name}`);
    }
    const start = parseDateTime(row.start_at), end = parseDateTime(row.end_at);
    const id = `${row.floor_id}:${new Date(start).toISOString()}`;
    if (seenSlots.has(id)) throw new Error(`フロアと開始日時が重複しています：${row.floor_id} ${row.start_at}`);
    seenSlots.add(id);
    if (end <= start) throw new Error(`終了時刻が開始時刻以前です：${id}`);
    const profileNames = [...new Set([...(djs.has(credit.displayName) ? [credit.displayName] : []), ...credit.djNames])];
    return { id, floorId: row.floor_id, ...credit, profileNames, start, end };
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
  if (!slots.length) return null;
  if (mode === 'before') return slots[0].start - 86_400_000;
  if (mode === 'after') return Math.max(...slots.map(slot => slot.end)) + 60_000;
  if (mode === 'during') {
    const timestamp = Date.parse(reference);
    if (slots.some(slot => slot.start <= timestamp && timestamp < slot.end)) return timestamp;
    return slots[0].start + Math.min(60_000, (slots[0].end - slots[0].start) / 2);
  }
  return null;
}
