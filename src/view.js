export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function renderIframe({ src, title, height, allow = '', lazy = true }) {
  return `<iframe src="${escapeHTML(src)}" title="${escapeHTML(title)}" width="100%"${height ? ` height="${height}"` : ''} allow="${escapeHTML(allow)}" allowfullscreen loading="${lazy ? 'lazy' : 'eager'}" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}
