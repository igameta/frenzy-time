import { imageUrl, safeUrl } from './embeds.js';
import { avatarUrl } from './avatars.js';

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function renderArtistPhoto(artist, { className = 'card-photo', members = [], base, avatars }) {
  const ownImage = imageUrl(artist.imageUrl, base);
  const fallback = dj => avatars?.get(dj.name) || avatarUrl(dj);
  const picture = (dj, photoClass = '') => {
    const own = imageUrl(dj.imageUrl, base), generated = fallback(dj);
    const label = `${dj.name}の${own ? 'プロフィール画像' : '自動生成アイコン'}`;
    return `<span class="${escapeHTML(photoClass)} artist-photo${own ? '' : ' is-generated'}" data-artist-name="${escapeHTML(dj.name)}"${photoClass === 'profile-photo' ? ` role="img" aria-label="${escapeHTML(label)}"` : ' aria-hidden="true"'}><img src="${escapeHTML(own || generated)}" data-fallback-src="${escapeHTML(generated)}" alt="" loading="lazy" decoding="async"><span class="avatar-brand" aria-hidden="true"></span></span>`;
  };
  if (!ownImage && members.length > 1) {
    const label = `${artist.name}のプロフィール画像（${members.map(member => member.name).join('・')}の画像を組み合わせ）`;
    return `<div class="${escapeHTML(className)} artist-collage" data-odd="${members.length % 2 === 1}" style="--photo-rows:${Math.ceil(members.length / 2)}"${className === 'profile-photo' ? ` role="img" aria-label="${escapeHTML(label)}"` : ' aria-hidden="true"'}>${members.map(member => picture(member)).join('')}</div>`;
  }
  return picture(artist, className);
}

export function renderIframe({ src, title, height, allow = '', lazy = true }) {
  return `<iframe src="${escapeHTML(src)}" title="${escapeHTML(title)}" width="100%"${height ? ` height="${height}"` : ''} allow="${escapeHTML(allow)}" allowfullscreen loading="${lazy ? 'lazy' : 'eager'}" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

export function renderMusicEmbed(track, djName) {
  return `<div class="music-embed" data-provider="${escapeHTML(track.provider)}">${renderIframe({ src: track.src, title: `${djName}の推し曲（${track.provider}）`, height: track.height, allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' })}</div>`;
}

export function renderProfileLink(url) {
  const favicon = new URL('/favicon.ico', url).href;
  return `<a class="text-link profile-social" href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer"><img class="social-favicon" src="${escapeHTML(favicon)}" width="18" height="18" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span>${escapeHTML(url.hostname)}</span><span aria-hidden="true">↗</span></a>`;
}

export function renderProfileLinks(value, base) {
  const urls = new Map();
  for (const item of String(value || '').split(',')) {
    const url = safeUrl(item.trim(), base);
    if (url) urls.set(url.href, url);
  }
  return urls.size ? `<div class="profile-links">${[...urls.values()].map(renderProfileLink).join('')}</div>` : '';
}
