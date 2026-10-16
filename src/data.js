import { normalizeData } from './model.js';

export function createDataSource(config, dependencies = {}) {
  const request = dependencies.fetch || globalThis.fetch;
  const storage = dependencies.storage;
  const sources = config.data.useSampleData
    ? ['./data/schedule.csv', './data/djs.csv']
    : [config.data.scheduleUrl, config.data.djsUrl];
  const key = `frenzy-time:data:v1:${JSON.stringify(sources)}`;
  let lastGood = null, lastUpdated = null;
  try {
    const cached = JSON.parse(storage?.getItem(key) || 'null');
    if (cached && Number.isFinite(cached.updated)) {
      lastGood = normalizeData(cached.schedule, cached.djs, config.floors);
      lastUpdated = cached.updated;
    }
  } catch { /* 破損したキャッシュや利用できないストレージは無視する。 */ }
  return {
    get snapshot() { return { data: lastGood, updated: lastUpdated }; },
    async refresh() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        if (sources.some(url => !url)) throw new Error('公開CSVのURLが未設定です。');
        const texts = await Promise.all(sources.map(async url => {
          const response = await request(url, { cache: 'no-store', signal: controller.signal, credentials: 'omit' });
          if (!response.ok) throw new Error(`データ取得に失敗しました（HTTP ${response.status}）。`);
          const type = response.headers?.get('content-type') || '';
          if (type.includes('text/html')) throw new Error('CSVではなくHTMLが返されました。公開CSVのURLを確認してください。');
          return response.text();
        }));
        const normalized = normalizeData(texts[0], texts[1], config.floors);
        lastGood = normalized; lastUpdated = Date.now();
        try { storage?.setItem(key, JSON.stringify({ schedule: texts[0], djs: texts[1], updated: lastUpdated })); }
        catch { /* キャッシュ保存に失敗しても読み込み済みデータで動作する。 */ }
        return { data: lastGood, updated: lastUpdated, error: null };
      } catch (error) {
        return { data: lastGood, updated: lastUpdated, error: error instanceof Error ? error.message : 'データの取得に失敗しました。' };
      } finally { clearTimeout(timer); controller.abort(); }
    },
  };
}
