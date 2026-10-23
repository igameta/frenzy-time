import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteEmbed, safeUrl, imageUrl, twitchUrls } from '../src/embeds.js';
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
