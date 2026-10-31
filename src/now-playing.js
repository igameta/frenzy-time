import config from '../config.js';
import { createDataSource } from './data.js';
import { createAvatarCatalog } from './avatars.js';
import { previewTime } from './model.js';
import { currentPerformance, renderNowPlaying } from './now-playing-view.js';

const overlay = document.getElementById('now-playing');
const parameters = new URLSearchParams(location.search);
const floorId = parameters.get('floor') || config.floors[0]?.id;
const floor = config.floors.find(item => item.id === floorId);
const isDevelopment = import.meta.env?.DEV === true;
const preview = isDevelopment && ['before', 'during', 'after'].includes(parameters.get('preview')) ? parameters.get('preview') : null;
let storage;
try { storage = localStorage; } catch { /* OBSのストレージが無効でも取得して表示する。 */ }
const source = createDataSource(config, { storage });
let data = source.snapshot.data, avatars = data ? createAvatarCatalog([...data.djs.values()]) : new Map();
let displayed = null, refreshing = false, loadError = false;

document.title = `Now Playing${floor ? ` · ${floor.name}` : ''} | ${config.eventName}`;

function render() {
  if (!floor) return;
  const timestamp = (preview && data ? previewTime(data.slots.filter(slot => slot.floorId === floor.id), preview,
    config.data.useSampleData ? config.demo?.duringAt : undefined) : null) ?? Date.now();
  const performance = currentPerformance(data, floor.id, timestamp);
  document.body.dataset.state = data ? performance ? 'playing' : 'idle' : loadError ? 'error' : 'loading';
  const key = performance?.slot.id || '';
  if (displayed === key) return;
  displayed = key;
  overlay.innerHTML = renderNowPlaying(performance, {
    eventName: config.eventName, floorName: floor.name, timeZone: config.timeZone, base: location.href, avatars,
  });
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const result = await source.refresh();
    if (result.data) {
      data = result.data;
      avatars = createAvatarCatalog([...data.djs.values()]);
      displayed = null;
    }
    loadError = Boolean(result.error);
    render();
    if (result.error) {
      document.body.dataset.dataError = 'true';
      console.warn(`Now Playing: ${result.error}`);
    } else delete document.body.dataset.dataError;
  } finally { refreshing = false; }
}

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.fallbackSrc) return;
  const fallback = image.dataset.fallbackSrc;
  delete image.dataset.fallbackSrc;
  image.closest('.artist-photo')?.classList.add('is-generated');
  if (image.src !== fallback) image.src = fallback;
}, true);

if (floor) {
  render();
  void refresh();
  // 外部データは本番では初回のみ取得し、時計による出演枠の判定は継続する。
  setInterval(render, 1_000);
  window.addEventListener('pageshow', render);
  document.addEventListener('visibilitychange', render);
  if (isDevelopment) setInterval(refresh, Math.max(15_000, config.data.refreshMs || 60_000));
} else {
  document.body.dataset.state = 'error';
  console.warn(`Now Playing: 未定義のフロアです：${floorId}`);
}
