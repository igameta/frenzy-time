import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarStyle, avatarSVG, avatarUrl, createAvatarCatalog } from '../src/avatars.js';

test('同じDJ名と紹介文は同じアイコンになり、無関係な文章変更では模様を変えない', () => {
  const artist = { name: 'DJ AO', profile: '当日はよろしくお願いします。' };
  assert.equal(avatarSVG(artist), avatarSVG({ ...artist }));
  assert.equal(avatarSVG(artist), avatarSVG({ ...artist, profile: '会場でお会いしましょう。' }));
  assert.notEqual(avatarSVG(artist), avatarSVG({ ...artist, name: 'Nagi' }));
});

test('紹介文のキーワードから控えめな形・密度・配置を選ぶ', () => {
  assert.equal(avatarStyle('温かいHouseと柔らかい音').shape, 'round');
  assert.equal(avatarStyle('浮遊感のあるアンビエント').shape, 'dot');
  assert.equal(avatarStyle('跳ねるビートで軽快に').shape, 'line');
  assert.equal(avatarStyle('跳ねるビートで軽快に').offset, true);
  assert.equal(avatarStyle('ミニマルな反復と跳ねるビート').offset, false);
  assert.ok(avatarStyle('ミニマルな反復').spacing < avatarStyle().spacing);
  assert.ok(avatarStyle('Floating ambient music').count < avatarStyle().count);
  const artist = { name: 'DJ AO', profile: '' };
  assert.notEqual(avatarSVG(artist), avatarSVG({ ...artist, profile: '温かいセット' }));
});

test('色はDJ名で固定し、紹介文や重複回避の再生成でも変えない', () => {
  const colors = svg => /<style>(.*?)<\/style>/.exec(svg)[1];
  const artist = { name: 'DJ AO', profile: '' };
  assert.equal(colors(avatarSVG(artist)), colors(avatarSVG({ ...artist, profile: '温かいセット' })));
  assert.equal(colors(avatarSVG(artist)), colors(avatarSVG(artist, 1)));
  assert.equal(colors(avatarSVG(artist)), colors(avatarSVG({ ...artist, name: ' DJ AO ' })));
  const variations = new Set(Array.from({ length: 64 }, (_, i) => colors(avatarSVG({ name: `DJ ${i}` }))));
  assert.ok(variations.size >= 4);
});

test('生成SVGには紹介文やDJ名を埋め込まず、実行可能な外部コンテンツを作らない', () => {
  const artist = { name: '<script>alert(1)</script>', profile: '<img src=x onerror=alert(1)>' };
  const svg = decodeURIComponent(avatarUrl(artist).split(',')[1]);
  assert.ok(svg.startsWith('<svg '));
  assert.ok(!svg.includes(artist.name));
  assert.ok(!svg.includes(artist.profile));
  assert.ok(!/<(?:script|foreignObject|image)\b|\bon\w+=/.test(svg));
});

test('登録DJ内でアイコンを重複させず、行順や再生成に左右されない', () => {
  const artists = Array.from({ length: 256 }, (_, i) => ({ name: `DJ ${i}`, profile: i % 2 ? '温かいHouse' : '' }));
  const catalog = createAvatarCatalog(artists);
  assert.equal(catalog.size, artists.length);
  assert.equal(new Set(catalog.values()).size, artists.length);
  const reversed = createAvatarCatalog([...artists].reverse());
  for (const [name, url] of catalog) assert.equal(reversed.get(name), url);
});
