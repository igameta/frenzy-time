import { lineup } from './model.js';
import { escapeHTML as e, renderArtistPhoto } from './view.js';

export function currentPerformance(data, floorId, timestamp) {
  if (!data) return null;
  const { current } = lineup(data.slots.filter(slot => slot.floorId === floorId), timestamp);
  if (!current) return null;
  const members = current.djNames.map(name => data.djs.get(name));
  const act = data.djs.get(current.displayName);
  return {
    slot: current, members,
    artist: act || (members.length === 1 ? members[0] : { name: current.displayName, imageUrl: '' }),
    genres: act ? act.genres : [...new Set(members.map(dj => dj.genres).filter(Boolean))].join(' / '),
  };
}

export function renderNowPlaying(performance, { eventName, floorName, timeZone = 'Asia/Tokyo', base, avatars }) {
  if (!performance) return '';
  const { slot, artist, members, genres } = performance;
  const format = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const time = value => `<time datetime="${new Date(value).toISOString()}">${format.format(value)}</time>`;
  return `<article class="now-card">${renderArtistPhoto(artist, { className: 'now-photo', members, base, avatars })}<div class="now-copy"><p class="now-context"><span>${e(eventName)}</span><span>${e(floorName)}</span></p><p class="now-label">NOW PLAYING</p><h1 class="now-name">${e(slot.displayName)}</h1><span class="now-time">${time(slot.start)}–${time(slot.end)}</span>${genres ? `<p class="now-genres">${e(genres)}</p>` : ''}</div></article>`;
}
