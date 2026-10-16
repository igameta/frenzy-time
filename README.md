# FRENZY TIME

文化祭のタイムテーブルと、2フロアまでのTwitch映像・コメントを表示する静的サイトです。ビルドに外部パッケージは不要で、Node.js 20以降で動作します。

```sh
npm run dev
```

`http://localhost:4173` を開きます。`file://` ではCSV読み込みやTwitchが動作しません。

## 設定

`config.js` のイベント名、フロア名、各フロアの `twitchChannel` を設定してください。チャンネル名はURL全体ではなく `example_channel` の部分です。空欄の場合は配信準備中と表示します。

初期状態では架空の2027年11月6日・7日のサンプルを表示します。サンプル表示中のみ、画面上の「公演前／開演後／終演後」で時刻を切り替えて確認できます。`?preview=during` などのパラメーターを使用し、本番モードでは無効です。

### 公開スプレッドシート

Googleスプレッドシートに `schedule` と `djs` の2つのタブを作成します。「ファイル → 共有 → ウェブに公開」で各タブを**CSV形式**で公開し、それぞれのURLを取得してください。ブラウザで開く編集用・閲覧用URLではなく、CSVを返すURLを使用します。

```js
data: {
  useSampleData: false,
  scheduleUrl: 'https://docs.google.com/spreadsheets/d/e/PUBLISHED_ID/pub?gid=SCHEDULE_GID&single=true&output=csv',
  djsUrl: 'https://docs.google.com/spreadsheets/d/e/PUBLISHED_ID/pub?gid=DJS_GID&single=true&output=csv',
  refreshMs: 60_000,
},
```

実データの検証中は、公開URLに第三者がアクセスでき、CORS制限がなくCSVが返ることを確認してください。公開シートには個人情報や認証情報を置かないでください。

#### schedule

| 列 | 必須 | 内容 |
| --- | --- | --- |
| `slot_id` | ○ | 出演枠ごとに一意の文字列 |
| `floor_id` | ○ | `config.js` のフロアIDと一致（例：`floor-1`） |
| `start_at` | ○ | `2027-11-07T13:00:00+09:00` のようなタイムゾーン付き日時 |
| `end_at` | ○ | 開始より後の日時 |
| `dj_name` | ○ | `djs.name` と完全一致するDJネーム |

`2027/11/7 13:00` などの自動変換を避けるため、日時列は「書式なしテキスト」にしてください。同一フロアの出演時刻の重複、未登録のフロア・DJ、重複する `slot_id` はエラーになります。日ごとのフロア数は出演枠から決定します。

#### djs

| 列 | 必須 | 内容 |
| --- | --- | --- |
| `name` | ○ | 一意のDJネーム。前後の空白を除いて完全一致で照合 |
| `genres` | ○ | ジャンル。`House / Disco` などの自由記述 |
| `profile` | ○ | プロフィール本文。改行可能 |
| `image_url` | | HTTPSの公開画像URL、またはサイト内の相対パス |
| `link_url` | | SNS・ホームページなどのURL |
| `favorite_track_url` | | 推し曲の共有URL。列名 `推し曲` も使用可能 |

プロフィールとジャンルは列自体が必須です。値は空欄にできます。推し曲はSpotifyとSoundCloudの公式iframeに対応します。Spotifyの通常・`intl-ja`・埋め込みURLを受け付けます。SoundCloudは `https://soundcloud.com/ユーザー/曲名` の完全URLを使用してください。短縮URLやその他の安全なHTTP(S) URLはリンクとして表示し、任意のHTMLは埋め込みません。空欄の場合は推し曲欄を隠します。

DJネームは大文字小文字を区別します。名前を変更するときは、両タブの値を揃えてください。両CSVを一組として検証し、どちらかが不正なら直前の正常データを使います。

## 画面の動作

- 開催前：全日程・開催する全フロアを表示し、Twitchサブスクライブへ誘導します。
- 初回開演後：日付・フロアを選択する表示に切り替えます。「全日程を見る」も利用できます。
- 最終終演後：全日程を表示し、日付・フロア別の確認にも戻れます。
- 配信ページ：フロアのみを切り替えます。開催日は現在日時から選び、前・現在・次のDJを表示します。休憩中は現在枠を作らず、直前のDJを残します。
- DJプロフィール：右側のオーバーレイ（スマートフォンでは下からのシート）で表示します。閉じるボタン・背景・Escで閉じ、元のボタンにフォーカスを戻します。プロフィールの開閉やデータ更新ではTwitch iframeを作り直しません。

表示は閲覧端末の時計と予定時刻に基づきます。実際の配信状態をAPIで判定するものではありません。時刻が押した場合はスプレッドシートの予定時刻を変更できます。直前の正常データはブラウザにも保存し、更新に失敗したことを画面に表示します。スプレッドシート側の公開キャッシュにより反映が遅れる場合があります。

### Twitch

現在のホスト名を `parent` に自動設定します。サイト全体を別のiframeに埋め込む場合は、外側のホスト名を `twitch.additionalParents` に追加してください。値は `example.com` のようにホスト名のみです。

Twitch公式の最小プレーヤー寸法は400×300pxです。表示領域が400px未満では、映像の代わりにTwitchへのリンクを表示します。横向きなどで幅を確保すればiframeで視聴できます。コメントは縦に続けて表示します。Twitch側のログイン状態・ブラウザのストレージ設定により、コメントへのログインが別途必要な場合があります。

参考：[Twitch映像](https://dev.twitch.tv/docs/embed/video-and-clips/)、[Twitchコメント](https://dev.twitch.tv/docs/embed/chat/)、[Spotify](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed)、[SoundCloud](https://developers.soundcloud.com/docs/api/html5-widget/)。

## 検証・配置

```sh
npm test
npm run build
npm run preview
```

生成された `dist/` の内容を静的ホスティングへ配置できます。サーバー側の処理や秘密鍵は不要です。`index.html` と `live.html` の相対リンクなので、サブディレクトリへの配置にも対応します。

ロゴは支給された `LOGO_MARK&TYPO.ai` のベクターパスから取り出し、`assets/frenzy-symbol.svg` と `assets/frenzy-wordmark.svg` に保存しています。画像未設定時は明示的なサンプル画像を使います。背景は単色、TDUの青 `#2D56A0` をアクセントに使用し、カードの角丸は2pxです。ヘッダーの背景シンボルは `showLogoBackdrop` で切り替えられます。
