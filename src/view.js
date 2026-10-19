export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function renderIframe({ src, title, height, allow = '', lazy = true }) {
  return `<iframe src="${escapeHTML(src)}" title="${escapeHTML(title)}" width="100%"${height ? ` height="${height}"` : ''} allow="${escapeHTML(allow)}" allowfullscreen loading="${lazy ? 'lazy' : 'eager'}" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

export function renderMusicEmbed(track, djName) {
  return `<div class="music-embed" data-provider="${escapeHTML(track.provider)}">${renderIframe({ src: track.src, title: `${djName}の推し曲（${track.provider}）`, height: track.height, allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' })}</div>`;
}
