import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteEmbed, resolveFavoriteEmbed, safeUrl, imageUrl, twitchUrls } from '../src/embeds.js';
import { escapeHTML, renderIframe } from '../src/view.js';

test('Spotify共有URLを検証済みの埋め込みURLにする', () => {
  assert.equal(favoriteEmbed('https://open.spotify.com/intl-ja/track/0Lr4kGOYn9l83EjuK6cZFQ?si=example').src, 'https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ');
  assert.equal(favoriteEmbed('https://open.spotify.com.evil.example/track/0Lr4kGOYn9l83EjuK6cZFQ'), null);
  assert.equal(favoriteEmbed('<iframe src="evil">'), null);
});
test('SoundCloudを自動再生しない公式プレーヤーで開く', () => {
  const result = favoriteEmbed('https://soundcloud.com/forss/flickermood');
  assert.equal(new URL(result.src).hostname, 'w.soundcloud.com');
  assert.equal(new URL(result.src).searchParams.get('auto_play'), 'false');
  assert.equal(favoriteEmbed('https://on.soundcloud.com/example'), null);
});

const shortTrack = 'https://on.soundcloud.com/hKIv5TT04yPylcT05Q';
const soundcloudHTML = '<iframe src="https://w.soundcloud.com/player/?visual=true&amp;url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F1450337839&amp;auto_play=true"></iframe>';

test('SoundCloud短縮URLを公式oEmbedで解決し、再表示時は取得結果を再利用する', async () => {
  const cache = new Map();
  let calls = 0;
  const fetch = async (value, options) => {
    calls++;
    const endpoint = new URL(value);
    assert.equal(endpoint.origin + endpoint.pathname, 'https://soundcloud.com/oembed');
    assert.equal(endpoint.searchParams.get('url'), shortTrack);
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ html: soundcloudHTML });
  };
  const result = await resolveFavoriteEmbed(shortTrack, { fetch, cache });
  const player = new URL(result.src);
  assert.equal(result.provider, 'SoundCloud');
  assert.equal(player.searchParams.get('url'), 'https://api.soundcloud.com/tracks/1450337839');
  assert.equal(player.searchParams.get('auto_play'), 'false');
  assert.equal(player.searchParams.get('visual'), 'false');
  assert.deepEqual(await resolveFavoriteEmbed(shortTrack, { fetch, cache }), result);
  assert.equal(calls, 1);
});

test('SoundCloud短縮URLの取得失敗はリンク表示に戻し、次回再取得できる', async () => {
  const cache = new Map();
  for (const fetch of [async () => { throw new Error('timeout'); }, async () => new Response('', { status: 429 }),
    async () => new Response('not json')]) {
    assert.equal(await resolveFavoriteEmbed(shortTrack, { fetch, cache }), null);
    assert.equal(cache.size, 0);
  }
  assert.ok(await resolveFavoriteEmbed(shortTrack, { fetch: async () => Response.json({ html: soundcloudHTML }), cache }));
});

test('SoundCloud以外への取得や不正な埋め込み先、外部HTMLの挿入を許可しない', async () => {
  const noFetch = async () => assert.fail('取得対象外');
  for (const value of ['https://on.soundcloud.com.evil.example/id', 'http://on.soundcloud.com/id',
    'https://user:pass@on.soundcloud.com/id', 'https://on.soundcloud.com/', 'https://on.soundcloud.com/id/extra',
    'https://example.com/track']) {
    assert.equal(await resolveFavoriteEmbed(value, { fetch: noFetch }), null);
  }
  assert.equal((await resolveFavoriteEmbed('https://soundcloud.com/forss/flickermood', { fetch: noFetch })).provider, 'SoundCloud');
  for (const src of ['https://evil.example/player/?url=https://api.soundcloud.com/tracks/1',
    'https://w.soundcloud.com/player/?url=https://evil.example/tracks/1',
    'https://w.soundcloud.com/player/?url=https://api.soundcloud.com.evil.example/tracks/1',
    'https://w.soundcloud.com/player/?url=http://api.soundcloud.com/tracks/1',
    'https://w.soundcloud.com/player/?url=https://api.soundcloud.com/users/1', 'javascript:alert(1)']) {
    assert.equal(await resolveFavoriteEmbed(shortTrack, {
      fetch: async () => Response.json({ html: `<iframe src="${src}"></iframe>` }), cache: new Map(),
    }), null, src);
  }
  const result = await resolveFavoriteEmbed(shortTrack, {
    fetch: async () => Response.json({ html: `<script>alert(1)</script>${soundcloudHTML}` }), cache: new Map(),
  });
  assert.ok(!result.src.includes('script'));
});

test('YouTubeの共有・通常・Shorts・ライブ・埋め込みURLを公式プレーヤーに変換する', () => {
  const id = 'egtI2xqg75E';
  for (const value of [`https://youtu.be/${id}?si=example`, `https://www.youtube.com/watch?v=${id}&list=example`,
    `https://m.youtube.com/watch?v=${id}`, `https://music.youtube.com/watch?v=${id}`,
    `https://youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`, `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`]) {
    const result = favoriteEmbed(value);
    assert.equal(result.provider, 'YouTube');
    const url = new URL(result.src);
    assert.equal(url.origin, 'https://www.youtube-nocookie.com');
    assert.equal(url.pathname, `/embed/${id}`);
    assert.equal(url.searchParams.get('playsinline'), '1');
    assert.equal(url.searchParams.has('autoplay'), false);
  }
});

test('YouTubeの偽ドメインや不正ID・動画なしのURLを埋め込まない', () => {
  for (const value of ['https://youtube.com.evil.example/watch?v=egtI2xqg75E',
    'https://www.youtube.com/watch?v=bad', 'https://youtu.be/egtI2xqg75E/extra',
    'https://www.youtube.com/playlist?list=example', 'https://www.youtube-nocookie.com/watch?v=egtI2xqg75E',
    'http://www.youtube.com/watch?v=egtI2xqg75E', 'https://user:password@www.youtube.com/watch?v=egtI2xqg75E']) {
    assert.equal(favoriteEmbed(value), null, value);
  }
});

test('同一オリジンのblob URLはプロフィール画像でのみ使用できる', () => {
  const blob = 'blob:https://festival.example/40a5fb5a-d56d-4a33-b4e2-0acf6a8e5f64';
  assert.equal(imageUrl(blob, 'https://festival.example/index.html'), blob);
  const local = blob.replace('https://festival.example', 'http://localhost:5173');
  assert.equal(imageUrl(local, 'http://localhost:5173/live.html'), local);
  assert.equal(safeUrl(blob, 'https://festival.example/'), null);
  assert.equal(favoriteEmbed(blob), null);
  for (const value of [blob, 'blob:null/example', 'blob:javascript:alert(1)',
    'blob:https://user:password@other.example/id', 'blob:https://other.example/',
    'blob:https://other.example/id\n']) {
    assert.equal(imageUrl(value, 'https://other.example/'), null, value);
  }
});
test('URLと表示文字列でスクリプト実行を防ぐ', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://user:password@example.com'), null);
  assert.equal(imageUrl('data:image/svg+xml,evil', 'https://example.com/'), null);
  assert.equal(imageUrl('./assets/dj.png', 'https://example.com/event/'), 'https://example.com/event/assets/dj.png');
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.ok(!renderIframe({ src: 'https://example.com/?x=" onload="evil', title: '" onload="evil' }).includes(' onload="'));
});
test('Twitch映像・コメントに同一のparentと選択チャンネルを設定する', () => {
  const result = twitchUrls('example_channel', 'festival.example', { additionalParents: ['container.example', 'festival.example'], autoplay: false }, true);
  for (const key of ['player', 'chat']) assert.deepEqual(new URL(result[key]).searchParams.getAll('parent'), ['festival.example', 'container.example']);
  assert.equal(new URL(result.player).searchParams.get('channel'), 'example_channel');
  assert.match(result.chat, /example_channel\/chat/);
  assert.equal(twitchUrls('bad/channel', 'example.com'), null);
  assert.equal(twitchUrls('valid', ''), null);
});
