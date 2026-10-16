// 公開情報のみを記入してください。APIキーや非公開シートの認証情報は不要です。
export default {
  eventName: '文化祭 DJイベント',
  timeZone: 'Asia/Tokyo',
  showLogoBackdrop: true,
  floors: [
    { id: 'floor-1', name: 'FLOOR 1', twitchChannel: '' },
    { id: 'floor-2', name: 'FLOOR 2', twitchChannel: '' },
  ],
  data: {
    // 接続時は useSampleData を false にし、「ウェブに公開」した各タブのCSV URLを指定。
    useSampleData: true,
    scheduleUrl: './data/schedule.csv',
    djsUrl: './data/djs.csv',
    refreshMs: 60_000,
  },
  twitch: {
    // サイトを別のページのiframe内に置く場合は、その親ページのホスト名も追加。
    additionalParents: [],
    autoplay: false,
    muted: false,
  },
  // サンプル表示の確認用。実際のイベント時刻には使いません。
  demo: { duringAt: '2027-11-07T13:45:00+09:00' },
};
