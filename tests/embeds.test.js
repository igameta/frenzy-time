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
