import config from '../config.js';
import { createDataSource } from './data.js';
import { activeDay, dateKey, eventDays, eventPhase, lineup, previewTime, slotsForDay } from './model.js';
import { favoriteEmbed, imageUrl, safeUrl, twitchUrls } from './embeds.js';
import { escapeHTML as e, renderIframe, renderMusicEmbed } from './view.js';

const page = document.body.dataset.page;
const parameters = new URLSearchParams(location.search);
const zone = config.timeZone || 'Asia/Tokyo';
const preview = config.data.useSampleData && ['before', 'during', 'after'].includes(parameters.get('preview')) ? parameters.get('preview') : null;
const floorIds = new Set(config.floors.map(floor => floor.id));
const state = {
  data: null, day: parameters.get('day'), floor: floorIds.has(parameters.get('floor')) ? parameters.get('floor') : null,
  view: null, renderKey: '', mediaKey: '', revision: '', refreshing: false, lastFocus: null, openDJ: null,
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

function now() { return (preview && state.data ? previewTime(state.data.slots, preview, config.demo?.duringAt) : null) ?? Date.now(); }
function floorById(id) { return config.floors.find(floor => floor.id === id); }
function dayTitle(day) { return dayFormat.format(new Date(`${day}T12:00:00+09:00`)); }
function range(slot) { return `<span class="slot-time"><time datetime="${new Date(slot.start).toISOString()}">${timeFormat.format(slot.start)}</time>–<time datetime="${new Date(slot.end).toISOString()}">${timeFormat.format(slot.end)}</time></span>`; }
function pageURL(file, extra = {}) {
  const url = new URL(file, location.href);
  if (preview) url.searchParams.set('preview', preview);
  for (const [key, value] of Object.entries(extra)) if (value) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
function artistButton(dj) { return `<button type="button" class="dj-name" data-dj="${e(dj.name)}" aria-haspopup="dialog">${e(dj.name)}<span class="profile-arrow" aria-hidden="true">↗</span></button>`; }
function photo(dj, className = 'card-photo') {
  const src = imageUrl(dj.imageUrl, location.href) || placeholder;
  return `<img class="${className}" src="${e(src)}" alt="${className === 'profile-photo' ? e(`${dj.name}のプロフィール画像${src === placeholder ? '（仮）' : ''}`) : ''}" loading="lazy" decoding="async">`;
}
function details(slot) {
  const dj = state.data.djs.get(slot.djName);
  return `<div class="dj-details"><div class="genres">${e(dj.genres)}</div>${artistButton(dj)}${range(slot)}</div>`;
}
function card(slot, label = '', className = '') {
  const dj = state.data.djs.get(slot.djName);
  return `<article class="dj-card ${className}">${photo(dj)}${label ? `<div class="slot-label">${e(label)}</div>` : ''}<div class="card-copy">${details(slot)}</div></article>`;
}
function picker(value, label, selected, action) {
  return `<button type="button" class="picker" data-action="${action}" data-value="${e(value)}" aria-pressed="${selected === value}">${e(label)}</button>`;
}

function renderDemoBanner() {
  if (!config.data.useSampleData) return;
  const options = [['before', '公演前'], ['during', '開演後'], ['after', '終演後']];
  const links = options.map(([value, label]) => {
    const url = new URL(location.href); url.searchParams.set('preview', value);
    return `<a href="${e(url.pathname + url.search)}" aria-current="${(preview || 'before') === value}">${label}</a>`;
  }).join('');
  document.getElementById('demo-banner').innerHTML = `<aside class="demo-banner" aria-label="サンプル表示"><p>サンプル表示 · 開催日・出演者・楽曲は仮の内容です。実際のイベント情報ではありません。</p><div class="demo-links">${links}<a href="${e(pageURL(page === 'live' ? './index.html' : './live.html'))}">${page === 'live' ? 'タイムテーブル' : '配信ページ'}を確認</a></div></aside>`;
}

function subscribeSection() {
  const used = config.floors.filter(floor => state.data.slots.some(slot => slot.floorId === floor.id));
  return `<section class="subscribe" aria-labelledby="subscribe-title"><div class="subscribe-copy"><span class="subscribe-kicker">FOLLOW ON TWITCH</span><h2 id="subscribe-title">Twitchでフォロー</h2><p>${e(config.eventName)}の当日配信はTwitchで！</p></div><div class="subscribe-actions">${used.map(floor => {
    const urls = twitchUrls(floor.twitchChannel, location.hostname, config.twitch);
    return `<div class="subscribe-item"><span class="subscribe-floor">${e(floor.name)}</span>${urls ? `<a class="subscribe-button" href="${e(urls.channel)}" target="_blank" rel="noopener noreferrer" aria-label="${e(floor.name)}のTwitchチャンネルを開いてフォローする（新しいタブ）"><span>フォローする</span><span aria-hidden="true">↗</span></a>` : '<span class="muted">Twitchチャンネルは後日公開</span>'}</div>`;
  }).join('')}</div></section>`;
}

function overview(phase) {
  const slots = state.data.slots, days = eventDays(slots, zone);
  return `<div class="meta"><span class="muted">${phase === 'before' ? '開催前' : phase === 'after' ? '全公演終了' : '全日程'} · 全日程・全フロア</span>${phase !== 'before' ? '<button type="button" class="picker" data-action="focus">日付・フロアを選んで見る</button>' : '<span class="muted">時刻はJST</span>'}</div>${phase === 'before' ? subscribeSection() : ''}<div class="all-days">${days.map((day, index) => {
    const floors = config.floors.filter(floor => slotsForDay(slots, day, floor.id, zone).length);
    return `<section><div class="day-header"><h2>DAY ${index + 1}</h2><p>${e(dayTitle(day))} · ${floors.length}フロア</p></div><div class="floors" data-count="${floors.length}" style="--floor-count:${floors.length}">${floors.map(floor => {
      const floorSlots = slotsForDay(slots, day, floor.id, zone);
      return `<section class="floor" aria-label="${e(`${dayTitle(day)} ${floor.name}`)}"><div class="floor-title"><h3>${e(floor.name)}</h3><span>${timeFormat.format(floorSlots[0].start)}–${timeFormat.format(floorSlots.at(-1).end)}</span></div><div class="cards">${floorSlots.map(slot => card(slot)).join('')}</div></section>`;
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
  return `<div class="focus-view"><div class="meta"><span class="muted">${heading} · 予定時刻に基づく表示</span><button type="button" class="picker" data-action="all">全日程を見る</button></div><div class="pickers" aria-label="開催日">${days.map((day, index) => picker(day, `DAY ${index + 1} · ${dayTitle(day)}`, state.day, 'day')).join('')}</div>${floors.length > 1 ? `<div class="pickers" aria-label="フロア">${floors.map(floor => picker(floor.id, floor.name, state.floor, 'floor')).join('')}</div>` : `<div class="one-floor">${e(floor.name)}</div>`}${featured ? `<section class="featured">${photo(state.data.djs.get(featured.djName))}<div class="card-copy"><span class="muted">現在の出演枠</span>${details(featured)}</div><a class="button-link" href="${e(pageURL('./live.html', { floor: state.floor }))}">このフロアの配信へ →</a></section>` : `<section class="empty-state"><p>${phase === 'after' || timestamp >= list.at(-1).end ? 'この日の公演は終了しました。' : timestamp < list[0].start ? 'この日の開演前です。' : '予定上は転換・休憩中です。'}</p><a class="text-link" href="${e(pageURL('./live.html', { floor: state.floor }))}">このフロアの配信へ →</a></section>`}<div class="timeline">${list.map(slot => {
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

function openProfile(button) {
  const name = button.dataset.dj, dj = state.data.djs.get(name);
  if (!dj) return;
  state.lastFocus = button; state.openDJ = name;
  const track = favoriteEmbed(dj.favoriteTrackUrl), trackUrl = safeUrl(dj.favoriteTrackUrl), link = safeUrl(dj.linkUrl, location.href);
  const matching = state.data.slots.filter(slot => slot.djName === name);
  document.getElementById('profile-panel').innerHTML = `<div class="profile-header"><span>DJ PROFILE</span><button type="button" class="close-profile" data-action="close-profile" aria-label="プロフィールを閉じる" autofocus>×</button></div>${photo(dj, 'profile-photo')}<h2 class="profile-name" id="profile-name">${e(dj.name)}</h2><div class="genres">${e(dj.genres)}</div><p class="profile-bio">${e(dj.profile)}</p>${link ? `<a class="text-link" href="${e(link.href)}" target="_blank" rel="noopener noreferrer">DJのリンク ↗</a>` : ''}${trackUrl ? `<section class="profile-song" aria-label="推し曲"><h3>推し曲</h3>${track ? renderMusicEmbed(track, dj.name) : ''}<a class="text-link" href="${e(trackUrl.href)}" target="_blank" rel="noopener noreferrer">曲のページを開く ↗</a></section>` : ''}<section class="profile-slots"><h3>出演予定</h3>${matching.map(slot => `<p class="profile-slot">${e(dayTitle(dateKey(slot.start, zone)))} / ${e(floorById(slot.floorId).name)}${range(slot)}</p>`).join('')}</section>`;
  dialog.showModal();
  dialog.querySelector('.close-profile').focus({ preventScroll: true });
}

dialog.addEventListener('close', () => {
  document.getElementById('profile-panel').replaceChildren();
  const target = state.lastFocus?.isConnected ? state.lastFocus : [...document.querySelectorAll('[data-dj]')].find(button => button.dataset.dj === state.openDJ);
  target?.focus({ preventScroll: true });
  state.lastFocus = null; state.openDJ = null;
});
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.src !== placeholder) image.src = placeholder;
}, true);

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.dj) { openProfile(button); return; }
  const action = button.dataset.action;
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
      state.revision = JSON.stringify([result.data.slots, [...result.data.djs]]);
      render();
    }
    if (result.error) {
      console.warn('タイムテーブル更新:', result.error);
      setStatus(result.data ? `更新できなかったため、直前のタイムテーブルを表示しています（取得：${shortDate.format(result.updated)}）。` : 'タイムテーブルを取得できませんでした。時間をおいて再読み込みしてください。', true);
    } else setStatus('');
  } finally { state.refreshing = false; }
}

renderDemoBanner();
if (source.snapshot.data) {
  state.data = source.snapshot.data;
  state.revision = JSON.stringify([state.data.slots, [...state.data.djs]]);
  setStatus('保存済みのタイムテーブルを表示しています。最新情報を確認中です。'); render();
}
if (location.protocol === 'file:') setStatus('HTTPサーバー経由で開いてください。READMEの起動手順を参照してください。', true);
else refresh();
setInterval(refresh, Math.max(10_000, config.data.refreshMs || 60_000));
setInterval(render, 15_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); refresh(); } });
if (page === 'live') {
  new ResizeObserver(() => mountMedia()).observe(document.getElementById('video-area'));
  darkScheme.addEventListener('change', mountMedia);
}
