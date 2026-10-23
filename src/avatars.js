const rules = {
  soft: /温か|暖か|あたたか|柔らか|やわらか|ゆったり|穏やか|\b(?:warm|soft|mellow)\b/i,
  ordered: /ミニマル|反復|精密|規則|\b(?:minimal|repetitive|precise)\b/i,
  airy: /浮遊|アンビエント|空間|\b(?:ambient|floating|spacious)\b/i,
  lively: /跳ね|跳び|跳ぶ|軽快|疾走|\b(?:bouncy|upbeat|energetic)\b/i,
};
const paletteHues = [215, 165, 38, 345, 275, 185];

export function avatarStyle(profile = '') {
  const matches = Object.fromEntries(Object.entries(rules).map(([key, rule]) => [key, rule.test(profile)]));
  return {
    shape: matches.airy ? 'dot' : matches.soft ? 'round' : matches.lively ? 'line' : 'square',
    spacing: matches.airy ? 22 : matches.soft ? 21 : matches.ordered ? 18 : 20,
    count: matches.airy ? 4 : matches.soft || matches.ordered ? 6 : 7,
    offset: matches.lively && !matches.ordered,
  };
}

function randomFor(value) {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) seed = Math.imul(seed ^ value.charCodeAt(i), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let result = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function avatarSVG(artist, salt = 0) {
  const random = randomFor(`${artist.name.trim()}\0${salt}`);
  const style = avatarStyle(artist.profile);
  // 模様とは別の乱数列を使い、既存の配置を維持して名前だけで色を固定する。
  const hue = paletteHues[Math.floor(randomFor(`palette\0${artist.name.trim()}`)() * paletteHues.length)];
  // 左半分と中央の15セルを名前に基づく固定順に並べ、左右対称に描く。
  const cells = Array.from({ length: 15 }, (_, index) => ({ row: Math.floor(index / 3), column: index % 3, rank: random(), tone: random() < .25 ? 'accent' : 'mark', shift: Math.floor(random() * 5) - 2 }));
  cells.sort((a, b) => a.rank - b.rank);
  const shapes = [];
  for (const cell of cells.slice(0, style.count).sort((a, b) => a.row - b.row || a.column - b.column)) {
    const y = 120 + (cell.row - 2) * style.spacing;
    const x = 120 + (cell.column - 2) * style.spacing + (style.offset ? cell.shift : 0);
    for (const cx of cell.column === 2 ? [120] : [x, 240 - x]) {
      if (style.shape === 'dot') shapes.push(`<circle class="${cell.tone}" cx="${cx}" cy="${y}" r="4"/>`);
      else if (style.shape === 'line') shapes.push(`<path class="${cell.tone} stroke" d="M${cx - 4} ${y + 4}l8 -8"/>`);
      else shapes.push(`<rect class="${cell.tone}" x="${cx - 6}" y="${y - 6}" width="12" height="12" rx="${style.shape === 'round' ? 6 : 1}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><style>.bg{fill:hsl(${hue} 24% 94%)}.mark{fill:hsl(${hue} 24% 47%)}.accent{fill:hsl(${hue} 30% 38%)}.stroke{fill:none;stroke:hsl(${hue} 24% 47%);stroke-width:3;stroke-linecap:round}.accent.stroke{stroke:hsl(${hue} 30% 38%)}@media(prefers-color-scheme:dark){.bg{fill:hsl(${hue} 18% 17%)}.mark{fill:hsl(${hue} 25% 66%)}.accent{fill:hsl(${hue} 28% 75%)}.stroke{stroke:hsl(${hue} 25% 66%)}.accent.stroke{stroke:hsl(${hue} 28% 75%)}}</style><rect class="bg" width="240" height="240"/>${shapes.join('')}</svg>`;
}

export function avatarUrl(artist) {
  return `data:image/svg+xml,${encodeURIComponent(avatarSVG(artist))}`;
}

export function createAvatarCatalog(artists) {
  const result = new Map(), used = new Set();
  const sorted = [...artists].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const artist of sorted) {
    let salt = 0, svg = avatarSVG(artist);
    while (used.has(svg)) svg = avatarSVG(artist, ++salt);
    used.add(svg);
    result.set(artist.name, `data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
  return result;
}
