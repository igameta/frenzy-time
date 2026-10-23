// 公開情報のみを記入してください。APIキーや非公開シートの認証情報は不要です。
export default {
  eventName: 'TDU RAVE2026',
  timeZone: 'Asia/Tokyo',
  showLogoBackdrop: true,
  floors: [
    { id: 'floor-1', name: 'メインステージ 5405A教室', twitchChannel: 'frenzynet' },
    { id: 'floor-2', name: '特別ステージ 武道場', twitchChannel: 'frenzynet2' },
  ],
  data: {
    // 接続時は useSampleData を false にし、「ウェブに公開」した各タブのCSV URLを指定。
    useSampleData: false,
    scheduleUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsuhKbnGB5dIvfk3f50RfZaGdGuD4ltjj4hfHakajv4iNsictIRtfbobv95EKF7zXkCEVshykDu61K/pub?gid=1657895347&single=true&output=csv',
    djsUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsuhKbnGB5dIvfk3f50RfZaGdGuD4ltjj4hfHakajv4iNsictIRtfbobv95EKF7zXkCEVshykDu61K/pub?gid=0&single=true&output=csv',
    refreshMs: 60_000, // Vite開発サーバーでの自動取得間隔。本番ビルドでは自動取得しない。
  },
  twitch: {
    // サイトを別のページのiframe内に置く場合は、その親ページのホスト名も追加。
    additionalParents: ["frenzy-time.igameta.com"],
    autoplay: false,
    muted: false,
  },
  // サンプル表示の確認用。実際のイベント時刻には使いません。
  demo: { duringAt: '2027-11-07T13:45:00+09:00' },
};
