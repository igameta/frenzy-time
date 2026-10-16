export function safeUrl(value, base = 'https://example.invalid/') {
  if (!value || /[\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

export function imageUrl(value, base) {
  const url = safeUrl(value, base);
  if (!url || (url.protocol !== 'https:' && url.origin !== new URL(base).origin)) return null;
  return url.href;
}

export function favoriteEmbed(value) {
  const url = safeUrl(value);
  if (!url || url.protocol !== 'https:') return null;
  if (url.hostname === 'open.spotify.com') {
    const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})\/?$/);
    if (!match) return null;
    return { provider: 'Spotify', src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, height: ['track', 'episode'].includes(match[1]) ? 152 : 352 };
  }
  if (['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname)) {
    if (!/^\/[^/]+\/[^/]+/.test(url.pathname)) return null;
    const player = new URL('https://w.soundcloud.com/player/');
    player.searchParams.set('url', url.href);
    player.searchParams.set('auto_play', 'false');
    player.searchParams.set('visual', 'false');
    return { provider: 'SoundCloud', src: player.href, height: 166 };
  }
  return null;
}

export function twitchUrls(channel, hostname, options = {}, dark = false) {
  if (!/^[a-zA-Z0-9_]{1,25}$/.test(channel || '') || !hostname) return null;
  const parents = [...new Set([hostname, ...(options.additionalParents || [])])];
  if (parents.some(parent => !/^[a-zA-Z0-9.-]+$/.test(parent))) return null;
  const player = new URL('https://player.twitch.tv/');
  player.searchParams.set('channel', channel);
  player.searchParams.set('autoplay', String(Boolean(options.autoplay)));
  player.searchParams.set('muted', String(Boolean(options.muted)));
  const chat = new URL(`https://www.twitch.tv/embed/${channel}/chat`);
  parents.forEach(parent => { player.searchParams.append('parent', parent); chat.searchParams.append('parent', parent); });
  if (dark) chat.searchParams.set('darkpopout', '');
  return { player: player.href, chat: chat.href, channel: `https://www.twitch.tv/${channel}`, subscribe: `https://www.twitch.tv/subs/${channel}` };
}
