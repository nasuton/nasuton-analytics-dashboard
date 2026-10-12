# ナストン アクセス解析

GitHub Pagesで動作する静的ダッシュボードです。HTML / CSS / JavaScript / Chart.jsを使用し、表示データはブラウザーからAPIへGETリクエストして取得します。ビルド・npm installは不要です。

## ローカル起動

Node.js 20以降で実行します。

```powershell
cd D:\work\javascript\nasuton-analytics-dashboard
npm run dev
```

http://127.0.0.1:4173 を開きます。API通信が必要なためインターネット接続が必要です。終了は Ctrl+C。

## API設定

`js/config.js` に取得先・取得開始月・タイムゾーン・通信タイムアウトを設定しています。

| 種類 | URL（https://nasuton.com/analytics/api 配下） | 応答の項目 |
| --- | --- | --- |
| 日別セッション | /sessions/daily | SessionDate, SessionCount |
| 国別ユーザー | /users/countries | MonthYear, Country, AccessCount |
| 流入元別ユーザー | /users/channels | MonthYear, SessionDefaultChannelGroup, AccessCount |
| 人気ページ | /pages/top | MonthYear, Rank, PageTitle, PageURL, PageViews |
| 月次サマリー | /overview/monthly | MonthYear, ActiveUsers, ScreenPageViews, NewUsers, EngagementRate |
| 入口ページ | /pages/landing | MonthYear, Rank, PageTitle, PageURL, Sessions, EngagementRate |
| デバイス別 | /users/devices | MonthYear, DeviceCategory, ActiveUsers, Sessions, ScreenPageViews |
| ブラウザ別 | /users/browsers | MonthYear, Browser, ActiveUsers, Sessions, ScreenPageViews |
| OS別 | /users/operating-systems | MonthYear, OperatingSystem, ActiveUsers, Sessions, ScreenPageViews |
| 参照元別 | /traffic/sources | MonthYear, SessionSource, SessionMedium, Sessions, ActiveUsers |
| 記事PV・前月比 | /pages/views | MonthYear, Rank, PageTitle, PageURL, PageViews, PreviousMonthPageViews |
| 検索キーワード | /search/queries | MonthYear, SiteURL, SearchType, QueryText, Clicks, Impressions, CTR, AveragePosition |

応答はJSON配列です。AccessCountはactiveUsers、EngagementRateは0〜1（0.473684なら47.4%）の数値として扱います。

追加6種類のエンドポイントは、Go API側の更新・再デプロイも必要です。追加SQLのテーブル名・列に対応し、既存の人気ページAPIは従来どおり利用します。

検索APIだけは `siteURL` と `searchType` を追加します。`js/config.js` の `search` にSearch Consoleの登録値を設定してください。初期値はSQLのSELECT例に合わせた `https://nasuton.net/blog/`、`web` です。Domainプロパティなら `sc-domain:nasuton.net` など、保存した値をそのまま指定します。検索種別は `web` / `image` / `video` / `news` に対応します。

```text
/search/queries?startDate=2026-08-01&endDate=2026-08-31&siteURL=https%3A%2F%2Fnasuton.net%2Fblog%2F&searchType=web
```

追加レポートの未取得の任意件数は `null`、実績ゼロは `0` です。記事タイトルは `null` も受け付け、URLを表示します。CTRは0〜1、表示回数0ならCTRと平均掲載順位は `null` です。

全APIに、同じ月の月初・月末のパラメーターを付けます。

```text
?startDate=2026-08-01&endDate=2026-08-31
```

複数月を1回で指定するとAPIがinvalid_periodを返すため、月別に取得します。認証ヘッダー・Cookieは送信しません。秘密鍵・APIキーをブラウザーに埋め込まないでください。JSONファイルへのフォールバックはありません。

### 取得とキャッシュ

- 初回は日別セッションと月次サマリーを、取得開始月（初期値2024-04）から日本時間の当月まで取得します。当月もAPIの仕様に従って月末を指定します。
- 国別・流入元別・人気ページ・入口ページと追加6種類は、画面で選択した月だけ取得します。
- 同時リクエストは最大4件。取得成功した月は画面を開いている間メモリーに保持し、同じ月の再選択では再通信しません。
- 集計が確定した過去月の応答は、加えて `sessionStorage`（キー `analytics:v1:{種類}:{年月}`）にも保存し、同じタブでのリロード後は再通信しません。読み出し時も検証し、壊れていれば破棄して再取得します。`sessionStorage` が使えない環境・容量超過時はメモリーキャッシュだけで動作します。
- **日本時間の当月と前月は毎回APIから取得**します。集計バッチが月次で動くため、月替わり直後の前月分がまだ確定していない可能性があるためです。
- 「再読み込み」でメモリーと `sessionStorage` の両方のキャッシュを破棄し、全期間を最新データで取得します。
- 1リクエストのタイムアウトは15秒です。履歴の一部が取得失敗した種類は、欠けた合計や前年比を出さないよう表示を保留します。他の種類は独立して表示できます。
- 空配列は正常な「データなし」として扱い、初期表示は取得できたデータの最新月にします。

### CORS

API側でブラウザーのOriginを許可してください（パスや末尾のスラッシュは含めません）。

- GitHub Pages: `https://nasuton.github.io`
- ローカル: `http://127.0.0.1:4173`
- localhostを使う場合: `http://localhost:4173`も別途許可

画面を独自ドメインや別ポートで開く場合は、そのOriginもAPI側に追加します。ブラウザーでCORS拒否になると、画面側から応答内容を読み取れないことがあります。画面は接続失敗を案内します。

## 画面・集計

- 年月を共通で切り替えます。取得開始月〜当月を選択でき、日次・サマリーに履歴がない月でも新しい明細を取得できます。初期選択は日次・サマリーの最新月です。API取得中は期間操作を無効にして、別の月のデータが混ざることを防ぎます。
- 月次サマリーは全体PV・アクティブユーザー数・新規ユーザー数・エンゲージメント率のカードと、指標を切り替える年間棒グラフです。人数の年間合算・率の単純平均はしません。
- 月別セッションと前月比・前年同月比は日別データから計算します。比較対象の両月の全日分が揃い、比較元が0でない場合だけ比較率を出します。
- 部分月のセッション合計には注記します。月次サマリーには収録日数がないため、その完全性は判定しません。
- 国別・流入元別はアクティブユーザー数です。分類の合計を全体ユーザー数にはしません。
- 人気ページは上位5件のPV、入口ページは上位10件のセッション数です。入口ページの表・ツールチップにはエンゲージメント率を併記します。
- 入口ページに同じURLが別順位で含まれる場合は合算せず、元の順位で表示して注記します。
- デバイス・ブラウザ・OSはアクティブユーザー数で、参照元はセッション数で並べます。追加6種類はグラフ上位10件・表上位50件を表示し、取得した全件数を注記します。NULLの任意指標は「—」です。
- 記事PVは全ページ集計用の新テーブルから取得します。前月PVはAPIが完全月・正常取得・品質制約なし・同じプロパティ／タイムゾーンを確認できた場合のみ返します。比較不能は「—」、前月0PVは増減件数のみ表示します。
- 検索キーワードはクリック数順に表示し、CTRと平均掲載順位を併記します。検索日付は太平洋時間で、非公開クエリ等の制約があります。キーワード別合計を検索全体の総数にしません。検索のキャッシュはサイト・検索種別ごとに分離します。
- 日別グラフは未取得と0件を区別します。土日は淡い色で表示します。
- APIの範囲外データ・不正な日付・負数・重複・率の範囲を検証します。ページタイトルはテキストとして表示し、記事リンクはHTTP/HTTPSのみ有効です。

## GitHub Pagesへ公開

1. コードをコミット・プッシュします。
2. GitHubの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します。
3. `.github/workflows/github-pages.yml` がmainへのpush（またはActions画面の手動実行）で、`npm test` の成功後に公開します。

公開物はindex.html・favicon・CSS・JavaScript・vendorです。表示データはすべてAPIから取得し、リポジトリにJSONデータは含みません。

## 構成と検証

- `js/config.js`: API設定
- `js/data-source.js`: 月別API取得、メモリー／sessionStorageキャッシュ、並列数制御、エラー処理
- `js/model.js`: 集計・日付・応答の検証
- `js/charts.js`: グラフ描画
- `js/app.js`: 年月選択と画面更新
- `vendor/`: Chart.js 4.5.1（MITライセンス）

`npm test` で集計・率の換算・APIの月末パラメーター・キャッシュ（メモリー／sessionStorage）・失敗時の分離・追加6種類のNULL／重複／検索条件・記事PV比較などを確認します。
