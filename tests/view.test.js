import test from 'node:test';
import assert from 'node:assert/strict';
import { renderArtistPhoto, renderProfileLinks, renderMusicEmbed } from '../src/view.js';
import { favoriteEmbed } from '../src/embeds.js';
import { avatarUrl } from '../src/avatars.js';

const base = 'https://festival.example/index.html';
const members = [{ name: 'DJ A', imageUrl: './a.jpg' }, { name: 'DJ B', imageUrl: 'https://images.example/b.jpg' }];
const options = { base, members, className: 'profile-photo' };

test('blob画像を参加DJの合成でも使用し、YouTubeの推し曲を表示する', () => {
  const blob = 'blob:https://festival.example/40a5fb5a-d56d-4a33-b4e2-0acf6a8e5f64';
  const solo = renderArtistPhoto({ name: 'DJ A', imageUrl: blob }, { base });
  assert.ok(solo.includes(`src="${blob}"`));
  assert.ok(!solo.includes('is-generated'));
  const group = renderArtistPhoto({ name: 'B2B', imageUrl: '' }, { ...options, members: [{ name: 'DJ A', imageUrl: blob }, members[1]] });
  assert.ok(group.includes(`src="${blob}"`));
  const track = renderMusicEmbed(favoriteEmbed('https://youtu.be/egtI2xqg75E'), 'DJ A');
  assert.ok(track.includes('data-provider="YouTube"'));
  assert.ok(track.includes('https://www.youtube-nocookie.com/embed/egtI2xqg75E'));
  assert.ok(track.includes('title="DJ Aの推し曲（YouTube）"'));
});

test('カンマ区切りのリンクを個別に検証し、FQDNとfavicon付きで表示する', () => {
  const html = renderProfileLinks(' https://x.com/example, ,https://soundcloud.com/example, https://x.com/example, javascript:alert(1), https://user:password@example.com ', base);
  assert.equal((html.match(/<a /g) || []).length, 2);
  assert.ok(html.includes('href="https://x.com/example"'));
  assert.ok(html.includes('href="https://soundcloud.com/example"'));
  assert.ok(html.includes('<span>x.com</span>'));
  assert.ok(html.includes('<span>soundcloud.com</span>'));
  assert.ok(html.includes('src="https://x.com/favicon.ico"'));
  assert.ok(html.includes('src="https://soundcloud.com/favicon.ico"'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('password'));
  assert.equal(renderProfileLinks('', base), '');
  assert.equal(renderProfileLinks(' , javascript:alert(1), ', base), '');
  const single = renderProfileLinks('https://example.com/a%2Cb?q=1&next=2', base);
  assert.equal((single.match(/<a /g) || []).length, 1);
  assert.ok(single.includes('href="https://example.com/a%2Cb?q=1&amp;next=2"'));
});

test('B2B画像がない場合は参加DJ全員の画像で一つの表示を作る', () => {
  const html = renderArtistPhoto({ name: 'A B2B B', imageUrl: '' }, options);
  assert.match(html, /artist-collage/);
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.ok(html.includes('src="https://festival.example/a.jpg"'));
  assert.ok(html.includes('src="https://images.example/b.jpg"'));
  assert.ok(html.includes('role="img"'));
  assert.ok(html.includes('DJ A・DJ B'));
});

test('名義の画像があればそれを優先し、個人の画像は混ぜない', () => {
  const html = renderArtistPhoto({ name: 'A B2B B', imageUrl: './group.jpg' }, options);
  assert.ok(!html.includes('artist-collage'));
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.ok(html.includes('src="https://festival.example/group.jpg"'));
  assert.ok(!html.includes('a.jpg'));
});

test('3人以上の合成と参加DJの画像未設定に対応し、危険なURLを使用しない', () => {
  const html = renderArtistPhoto({ name: '<B2B>', imageUrl: 'javascript:alert(1)' }, {
    ...options, members: [...members, { name: 'DJ C', imageUrl: 'javascript:alert(1)' }],
  });
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.ok(html.includes('data-odd="true"'));
  assert.ok(html.includes('--photo-rows:2'));
  assert.ok(html.includes(`src="${avatarUrl({ name: 'DJ C' })}"`));
  assert.ok(html.includes('&lt;B2B&gt;'));
  assert.ok(!html.includes('javascript:'));
  const solo = renderArtistPhoto({ name: 'DJ C', imageUrl: '' }, { base });
  assert.ok(!solo.includes('artist-collage'));
  assert.ok(solo.includes(`src="${avatarUrl({ name: 'DJ C' })}"`));
});

test('生成アイコンを名簿から取得し、読み込み失敗時にも同じアイコンを使用する', () => {
  const fallback = avatarUrl({ name: 'DJ A', profile: '浮遊感のあるセット' });
  const html = renderArtistPhoto(members[0], { base, avatars: new Map([['DJ A', fallback]]) });
  assert.ok(html.includes('src="https://festival.example/a.jpg"'));
  assert.ok(html.includes(`data-fallback-src="${fallback}"`));
});
