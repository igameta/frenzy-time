import config from '../config.js';
import { createDataSource } from './data.js';
import { createAvatarCatalog } from './avatars.js';
import { activeDay, dateKey, eventDays, eventPhase, lineup, previewTime, slotsForDay } from './model.js';
import { favoriteEmbed, resolveFavoriteEmbed, safeUrl, twitchUrls } from './embeds.js';
import { escapeHTML as e, renderArtistPhoto, renderIframe, renderMusicEmbed, renderProfileLinks } from './view.js';

const page = document.body.dataset.page;
const isDevelopment = import.meta.env?.DEV === true;
const autoRefresh = isDevelopment;
const parameters = new URLSearchParams(location.search);
const zone = config.timeZone || 'Asia/Tokyo';
const preview = isDevelopment && ['before', 'during', 'after'].includes(parameters.get('preview')) ? parameters.get('preview') : null;
const floorIds = new Set(config.floors.map(floor => floor.id));
const state = {
  data: null, day: parameters.get('day'), floor: floorIds.has(parameters.get('floor')) ? parameters.get('floor') : null,
  view: null, renderKey: '', mediaKey: '', revision: '', refreshing: false, lastFocus: null, openSlot: null, openDJ: null, avatars: new Map(),
};
const dialog = document.getElementById('dj-dialog');
const status = document.getElementById('data-status');
const placeholder = new URL('../assets/dj-placeholder.svg', import.meta.url).href;
const darkScheme = matchMedia('(prefers-color-scheme: dark)');
let storage;
try { storage = localStorage; } catch { /* ストレージが禁止されたブラウザでも動作する。 */ }
const source = createDataSource(config, { storage });
const timeFormat = new Intl.DateTimeFormat('ja-JP', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFormat = new Intl.DateTimeFormat('ja-JP', { timeZone: zone, month: 'long', day: 'numeric', weekday: 'short' });
const shortDate = new Intl.DateTimeFormat('ja-JP', { timeZone: zone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

document.getElementById('event-name').textContent = config.eventName;
document.body.dataset.logoBackdrop = String(config.showLogoBackdrop !== false);
document.title = `${page === 'live' ? '配信' : 'タイムテーブル'} | ${config.eventName}`;

function now() { return (preview && state.data ? previewTime(state.data.slots, preview, config.data.useSampleData ? config.demo?.duringAt : undefined) : null) ?? Date.now(); }
function floorById(id) { return config.floors.find(floor => floor.id === id); }
function floorTone(id) { return config.floors.findIndex(floor => floor.id === id) % 2 === 1 ? 'muted' : 'blue'; }
function dayTitle(day) { return dayFormat.format(new Date(`${day}T12:00:00+09:00`)); }
function range(slot) { return `<span class="slot-time"><time datetime="${new Date(slot.start).toISOString()}">${timeFormat.format(slot.start)}</time>–<time datetime="${new Date(slot.end).toISOString()}">${timeFormat.format(slot.end)}</time></span>`; }
function pageURL(file, extra = {}) {
  const url = new URL(file, location.href);
  if (preview) url.searchParams.set('preview', preview);
  for (const [key, value] of Object.entries(extra)) if (value) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
function artistButton(slot) { return `<button type="button" class="dj-name" data-slot="${e(slot.id)}" aria-haspopup="dialog">${e(slot.displayName)}<span class="profile-arrow" aria-hidden="true">↗</span></button>`; }
function photo(dj, className = 'card-photo', members = []) {
  return renderArtistPhoto(dj, { className, members, base: location.href, avatars: state.avatars });
}
function slotDJs(slot) { return slot.djNames.map(name => state.data.djs.get(name)); }
function slotProfiles(slot) { return slot.profileNames.map(name => state.data.djs.get(name)); }
function slotPhotos(slot) {
  const act = state.data.djs.get(slot.displayName);
  const djs = slotDJs(slot);
  return photo(act || (djs.length === 1 ? djs[0] : { name: slot.displayName, imageUrl: '' }), 'card-photo', djs);
}
function details(slot) {
  const act = state.data.djs.get(slot.displayName);
  const genres = act ? act.genres : [...new Set(slotDJs(slot).map(dj => dj.genres).filter(Boolean))].join(' / ');
  return `<div class="dj-details"><div class="genres">${e(genres)}</div>${artistButton(slot)}${range(slot)}</div>`;
}
function cardNumber(slot) {
  const list = slotsForDay(state.data.slots, dateKey(slot.start, zone), slot.floorId, zone);
  const number = list.findIndex(item => item.id === slot.id) + 1;
  return `<span class="slot-number" role="img" aria-label="出演順 ${number}番">${String(number).padStart(2, '0')}</span>`;
}
function card(slot, label = '', className = '') {
  return `<article class="dj-card ${className}" data-floor-tone="${floorTone(slot.floorId)}">${slotPhotos(slot)}${cardNumber(slot)}${label ? `<div class="slot-label">${e(label)}</div>` : ''}<div class="card-copy">${details(slot)}</div></article>`;
}
function picker(value, label, selected, action) {
  return `<button type="button" class="picker"${['floor', 'live-floor'].includes(action) ? ` data-floor-tone="${floorTone(value)}"` : ''} data-action="${action}" data-value="${e(value)}" aria-pressed="${selected === value}">${e(label)}</button>`;
}

function renderPreviewBanner() {
  if (!isDevelopment) return;
  const options = [['before', '公演前'], ['during', '開演後'], ['after', '終演後']];
  const links = options.map(([value, label]) => {
    const url = new URL(location.href); url.searchParams.set('preview', value);
    return `<a href="${e(url.pathname + url.search)}" aria-current="${preview === value}">${label}</a>`;
  }).join('');
  document.getElementById('demo-banner').innerHTML = `<aside class="demo-banner" aria-label="開発プレビュー"><p>開発プレビュー · ${config.data.useSampleData ? 'サンプルデータ' : '公開スプレッドシート'} · 表示上の時刻のみ切り替えます。</p><div class="demo-links">${links}<a href="${e(pageURL(page === 'live' ? './index.html' : './live.html'))}">${page === 'live' ? 'タイムテーブル' : '配信ページ'}を確認</a></div></aside>`;
}

function subscribeSection() {
  const used = config.floors.filter(floor => state.data.slots.some(slot => slot.floorId === floor.id));
  return `<section class="subscribe" aria-labelledby="subscribe-title"><div class="subscribe-copy"><span class="subscribe-kicker">FOLLOW ON TWITCH</span><h2 id="subscribe-title">Twitchでフォロー</h2><p>${e(config.eventName)}の当日配信はTwitchで！</p></div><div class="subscribe-actions">${used.map(floor => {
    const urls = twitchUrls(floor.twitchChannel, location.hostname, config.twitch);
    return `<div class="subscribe-item" data-floor-tone="${floorTone(floor.id)}"><span class="subscribe-floor">${e(floor.name)}</span>${urls ? `<a class="subscribe-button" href="${e(urls.channel)}" target="_blank" rel="noopener noreferrer" aria-label="${e(floor.name)}のTwitchチャンネルを開いてフォローする（新しいタブ）"><span>フォローする</span><span aria-hidden="true">↗</span></a>` : '<span class="muted">Twitchチャンネルは後日公開</span>'}</div>`;
  }).join('')}</div></section>`;
}

function overview(phase) {
  const slots = state.data.slots, days = eventDays(slots, zone);
  return `<div class="meta"><span class="muted">${phase === 'before' ? '開催前' : phase === 'after' ? '全公演終了' : '全日程'} · 全日程・全フロア</span>${phase !== 'before' ? '<button type="button" class="picker" data-action="focus">日付・フロアを選んで見る</button>' : '<span class="muted"></span>'}</div>${phase === 'before' ? subscribeSection() : ''}<div class="all-days">${days.map((day, index) => {
    const floors = config.floors.filter(floor => slotsForDay(slots, day, floor.id, zone).length);
    const cardRows = Math.max(...floors.map(floor => Math.ceil(slotsForDay(slots, day, floor.id, zone).length / 2)));
    return `<section><div class="day-header"><div class="day-heading"><h2>DAY ${index + 1}</h2><p class="day-date">${e(dayTitle(day))}</p></div></div><div class="floors" data-count="${floors.length}" style="--floor-count:${floors.length};--card-row-count:${cardRows}">${floors.map(floor => {
      const floorSlots = slotsForDay(slots, day, floor.id, zone);
      return `<section class="floor" data-floor-tone="${floorTone(floor.id)}" aria-label="${e(`${dayTitle(day)} ${floor.name}`)}"><div class="floor-title"><h3>${e(floor.name)}</h3>${range({ start: floorSlots[0].start, end: floorSlots.at(-1).end })}</div><div class="cards">${floorSlots.map(slot => card(slot)).join('')}</div></section>`;
    }).join('')}</div></section>`;
  }).join('')}</div>${phase !== 'before' ? `<a class="text-link" href="${e(pageURL('./live.html', { floor: state.floor }))}">配信ページへ →</a>` : ''}`;
}

function focusedSchedule(phase) {
  const slots = state.data.slots, timestamp = now(), days = eventDays(slots, zone);
  if (!days.includes(state.day)) state.day = activeDay(slots, timestamp, zone);
  const floors = config.floors.filter(floor => slotsForDay(slots, state.day, floor.id, zone).length);
  if (!floors.some(floor => floor.id === state.floor)) state.floor = floors[0].id;
  const list = slotsForDay(slots, state.day, state.floor, zone), positions = lineup(list, timestamp);
  const featured = positions.current;
  const heading = phase === 'after' ? '全公演終了' : '開演後';
  const floor = floorById(state.floor);
  return `<div class="focus-view" data-floor-tone="${floorTone(state.floor)}"><div class="meta"><span class="muted">${heading} · 予定時刻に基づく表示</span><button type="button" class="picker" data-action="all">全日程を見る</button></div><div class="pickers" aria-label="開催日">${days.map((day, index) => picker(day, `DAY ${index + 1} · ${dayTitle(day)}`, state.day, 'day')).join('')}</div>${floors.length > 1 ? `<div class="pickers" aria-label="フロア">${floors.map(floor => picker(floor.id, floor.name, state.floor, 'floor')).join('')}</div>` : `<div class="one-floor">${e(floor.name)}</div>`}${featured ? `<section class="featured">${slotPhotos(featured)}${cardNumber(featured)}<div class="card-copy"><span class="muted">現在の出演枠</span>${details(featured)}</div><a class="button-link" href="${e(pageURL('./live.html', { floor: state.floor }))}">このフロアの配信へ →</a></section>` : `<section class="empty-state"><p>${phase === 'after' || timestamp >= list.at(-1).end ? 'この日の公演は終了しました。' : timestamp < list[0].start ? 'この日の開演前です。' : '予定上は転換・休憩中です。'}</p><a class="text-link" href="${e(pageURL('./live.html', { floor: state.floor }))}">このフロアの配信へ →</a></section>`}<div class="timeline">${list.map(slot => {
    const position = slot === positions.current ? ['現在のDJ', 'is-current'] : slot === positions.previous ? ['1つ前のDJ', 'is-previous'] : slot === positions.next ? ['次のDJ', ''] : ['', ''];
    return card(slot, ...position);
  }).join('')}</div><p class="schedule-note">出演時刻は予定です。進行により前後します。実際の出演状況は配信でご確認ください。</p></div>`;
}

function renderSchedule(phase) {
  const all = phase === 'before' || state.view === 'all' || (phase === 'after' && state.view !== 'focused');
  document.getElementById('schedule-content').innerHTML = all ? overview(phase) : focusedSchedule(phase);
}

function renderLineup() {
  const slots = state.data.slots, timestamp = now(), day = activeDay(slots, timestamp, zone);
  document.getElementById('live-lineup').dataset.floorTone = floorTone(state.floor);
  const list = slotsForDay(slots, day, state.floor, zone), positions = lineup(list, timestamp);
  const slotsHtml = [
    ['previous', 'Prev DJ', 'まだ前の出演枠はありません。'],
    ['current', 'Current DJ', list.length ? timestamp >= list.at(-1).end ? '本日の公演は終了しました。' : timestamp < list[0].start ? '開演前です。' : '転換・休憩中です。' : 'このフロアの本日の公演はありません。'],
    ['next', 'Next DJ', '次の出演予定はありません。'],
  ].map(([position, label, empty]) => positions[position] ? card(positions[position], label, `is-${position}`) : `<article class="dj-card empty-slot"><span class="slot-label">${label}</span><p>${empty}</p></article>`).join('');
  document.getElementById('live-lineup').innerHTML = `<div class="lineup-heading"><h2>出演予定</h2><p>${e(dayTitle(day))} · ${e(floorById(state.floor).name)}</p></div><div class="lineup">${slotsHtml}</div><p class="schedule-note">予定時刻に基づく表示です。配信の実際の出演状況と異なる場合があります。</p>`;
}

function mountMedia() {
  const floor = floorById(state.floor);
  if (!floor) return;
  const video = document.getElementById('video-area'), chat = document.getElementById('chat-area');
  const urls = twitchUrls(floor.twitchChannel, location.hostname, config.twitch, darkScheme.matches);
  const narrow = video.clientWidth < 400;
  const key = JSON.stringify([floor.id, urls?.player, narrow]);
  if (state.mediaKey !== key) {
    state.mediaKey = key;
    video.classList.toggle('has-embed', Boolean(urls && !narrow));
    video.innerHTML = !urls
      ? `<p>${e(floor.name)}の配信準備中</p><p class="muted">配信先は開催前にご案内します。</p>`
      : narrow
        ? `<p>${e(floor.name)}の配信</p><p class="muted">横向きにするか、Twitchで視聴できます。</p><a class="button-link" href="${e(urls.channel)}" target="_blank" rel="noopener noreferrer">Twitchで配信を開く ↗</a>`
        : renderIframe({ src: urls.player, title: `${floor.name}のTwitch配信`, allow: 'autoplay; fullscreen; picture-in-picture', lazy: false });
    chat.innerHTML = urls ? renderIframe({ src: urls.chat, title: `${floor.name}のTwitchコメント`, lazy: false }) : '<p>配信の開始までお待ちください。</p>';
  } else if (urls && chat.querySelector('iframe')?.src !== urls.chat) {
    chat.querySelector('iframe').src = urls.chat;
  }
}

function renderLive() {
  if (!floorIds.has(state.floor)) state.floor = config.floors[0].id;
  const floorButtons = document.getElementById('live-floors');
  const html = config.floors.length > 1 ? config.floors.map(floor => picker(floor.id, floor.name, state.floor, 'live-floor')).join('') : `<span class="one-floor">${e(config.floors[0].name)}</span>`;
  if (floorButtons.innerHTML !== html) floorButtons.innerHTML = html;
  renderLineup();
  mountMedia();
  document.getElementById('back-to-schedule').href = pageURL('./index.html');
}

function render() {
  if (!state.data) return;
  const phase = eventPhase(state.data.slots, now());
  const boundary = state.data.slots.map(slot => now() < slot.start ? 'future' : now() < slot.end ? 'current' : 'past').join(',');
  const key = JSON.stringify([state.revision, phase, boundary, state.day, state.floor, state.view, dateKey(now(), zone)]);
  if (key === state.renderKey) return;
  if (page === 'live') renderLive(); else renderSchedule(phase);
  state.renderKey = JSON.stringify([state.revision, phase, boundary, state.day, state.floor, state.view, dateKey(now(), zone)]);
}

function renderProfile(name) {
  const dj = state.data.djs.get(name);
  if (!dj) return;
  state.openDJ = name;
  const track = favoriteEmbed(dj.favoriteTrackUrl), trackUrl = safeUrl(dj.favoriteTrackUrl);
  const matching = state.data.slots.filter(slot => slot.profileNames.includes(name));
  const context = state.data.slots.find(slot => slot.id === state.openSlot);
  const members = context?.displayName === name ? slotDJs(context) : [];
  document.getElementById('profile-body').innerHTML = `${photo(dj, 'profile-photo', members)}<h2 class="profile-name" id="profile-name">${e(dj.name)}</h2><div class="genres">${e(dj.genres)}</div><p class="profile-bio">${e(dj.profile)}</p>${renderProfileLinks(dj.linkUrl, location.href)}${trackUrl ? `<section class="profile-song" aria-label="推し曲"><h3>推し曲</h3>${track ? renderMusicEmbed(track, dj.name) : ''}<a class="text-link" href="${e(trackUrl.href)}" target="_blank" rel="noopener noreferrer">曲のページを開く ↗</a></section>` : ''}<section class="profile-slots"><h3>出演予定</h3>${matching.map(slot => `<p class="profile-slot">${e(dayTitle(dateKey(slot.start, zone)))} / ${e(floorById(slot.floorId).name)}${range(slot)}${slot.displayName !== name ? `<span class="muted">${e(slot.displayName)}</span>` : ''}</p>`).join('')}</section>`;
  dialog.querySelectorAll('[data-action="profile-member"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === name)));
  if (trackUrl && !track) {
    const song = document.getElementById('profile-body').querySelector('.profile-song');
    resolveFavoriteEmbed(dj.favoriteTrackUrl).then(resolved => {
      // 取得中に別のDJへ切り替えたり閉じたりした場合は古い表示を更新しない。
      if (resolved && song.isConnected) song.querySelector('h3').insertAdjacentHTML('afterend', renderMusicEmbed(resolved, dj.name));
    });
  }
}

function openProfile(button) {
  const slot = state.data.slots.find(slot => slot.id === button.dataset.slot);
  if (!slot) return;
  state.lastFocus = button; state.openSlot = slot.id;
  const members = slotProfiles(slot);
  document.getElementById('profile-panel').innerHTML = `<div class="profile-header"><span>DJ PROFILE</span><button type="button" class="close-profile" data-action="close-profile" aria-label="プロフィールを閉じる" autofocus>×</button></div>${members.length > 1 ? `<p class="profile-act">${e(slot.displayName)}</p><div class="profile-members" role="group" aria-label="プロフィールを表示する名義・DJ">${members.map(dj => `<button type="button" class="profile-member" data-action="profile-member" data-value="${e(dj.name)}" aria-pressed="false" aria-controls="profile-body">${photo(dj, 'member-photo', dj.name === slot.displayName ? slotDJs(slot) : [])}<span>${e(dj.name)}</span></button>`).join('')}</div>` : ''}<div id="profile-body"></div>`;
  renderProfile(members[0].name);
  dialog.showModal();
  dialog.querySelector('.close-profile').focus({ preventScroll: true });
}

dialog.addEventListener('close', () => {
  document.getElementById('profile-panel').replaceChildren();
  const target = state.lastFocus?.isConnected ? state.lastFocus : [...document.querySelectorAll('[data-slot]')].find(button => button.dataset.slot === state.openSlot);
  target?.focus({ preventScroll: true });
  state.lastFocus = null; state.openSlot = null; state.openDJ = null;
});
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.classList.contains('social-favicon')) {
    image.hidden = true;
    return;
  }
  if (image instanceof HTMLImageElement && image.dataset.fallbackSrc) {
    const fallback = image.dataset.fallbackSrc;
    delete image.dataset.fallbackSrc;
    if (image.src !== fallback) {
      const portrait = image.closest('.artist-photo');
      portrait?.classList.add('is-generated');
      if (portrait?.getAttribute('role') === 'img') portrait.setAttribute('aria-label', `${portrait.dataset.artistName}の自動生成アイコン`);
      image.src = fallback;
      return;
    }
  }
  if (image instanceof HTMLImageElement && image.src !== placeholder) image.src = placeholder;
}, true);

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.slot) { openProfile(button); return; }
  const action = button.dataset.action;
  if (action === 'profile-member') {
    const slot = state.data.slots.find(slot => slot.id === state.openSlot);
    if (slot?.profileNames.includes(button.dataset.value) && button.dataset.value !== state.openDJ) renderProfile(button.dataset.value);
    return;
  }
  if (action === 'close-profile') { dialog.close(); return; }
  if (action === 'retry') { refresh(); return; }
  if (action === 'all') state.view = 'all';
  if (action === 'focus') state.view = 'focused';
  if (action === 'day') { state.day = button.dataset.value; state.floor = null; }
  if (action === 'floor' || action === 'live-floor') state.floor = button.dataset.value;
  if (!action) return;
  render();
  const replacement = [...document.querySelectorAll('[data-action]')].find(item => item.dataset.action === action && item.dataset.value === button.dataset.value);
  replacement?.focus({ preventScroll: true });
  if (action === 'live-floor') {
    const url = new URL(location.href); url.searchParams.set('floor', state.floor);
    history.replaceState(null, '', url);
  }
});

function setStatus(message, isError = false) {
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle('is-error', isError);
  if (isError && !status.querySelector('button')) {
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'picker'; retry.dataset.action = 'retry'; retry.textContent = '再読み込み';
    status.append(' ', retry);
  }
}
async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    const result = await source.refresh();
    if (result.data) {
      state.data = result.data;
      state.avatars = createAvatarCatalog(result.data.djs.values());
      state.revision = JSON.stringify([result.data.slots, [...result.data.djs]]);
      render();
    }
    if (result.error) {
      console.warn('タイムテーブル更新:', result.error);
      setStatus(result.data ? `更新できなかったため、直前のタイムテーブルを表示しています（取得：${shortDate.format(result.updated)}）。` : 'タイムテーブルを取得できませんでした。時間をおいて再読み込みしてください。', true);
    } else setStatus('');
  } finally { state.refreshing = false; }
}

renderPreviewBanner();
if (source.snapshot.data) {
  state.data = source.snapshot.data;
  state.avatars = createAvatarCatalog(state.data.djs.values());
  state.revision = JSON.stringify([state.data.slots, [...state.data.djs]]);
  setStatus('保存済みのタイムテーブルを表示しています。最新情報を確認中です。'); render();
}
if (location.protocol === 'file:') setStatus('HTTPサーバー経由で開いてください。READMEの起動手順を参照してください。', true);
else refresh();
if (autoRefresh) setInterval(refresh, Math.max(10_000, config.data.refreshMs || 60_000));
setInterval(render, 15_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    render();
    if (autoRefresh) refresh();
  }
});
if (page === 'live') {
  new ResizeObserver(() => mountMedia()).observe(document.getElementById('video-area'));
  darkScheme.addEventListener('change', mountMedia);
}
