# ナストン アクセス解析

GitHub Pages向けの静的ダッシュボードです。HTML / CSS / JavaScriptとChart.jsを使用します。ビルド不要で、実データやAPIキーは同梱していません。

## JSONを配置する

次の6ファイルを `data/` へ置いてください。ファイル名・大文字小文字・項目名は以下の通りです。UTF-8のJSON配列を読み込みます。

| ファイル | 項目 | 指標 |
| --- | --- | --- |
| DailySessions.json | SessionDate, SessionCount | 日別セッション数 |
| MonthlyCountryAccess.json | MonthYear, Country, AccessCount | 国別アクティブユーザー数 |
| MonthlySessionDefaultChannelGroupAccess.json | MonthYear, SessionDefaultChannelGroup, AccessCount | 流入元別アクティブユーザー数 |
| MonthlyTopPages.json | MonthYear, Rank, PageTitle, PageURL, PageViews | 月別の人気ページTOP5・PV |
| MonthlyOverview.json | MonthYear, ActiveUsers, ScreenPageViews, NewUsers, EngagementRate | 月ごとの全体ユーザー数・総PV・新規ユーザー数・エンゲージメント率 |
| MonthlyLandingPages.json | MonthYear, Rank, PageTitle, PageURL, Sessions, EngagementRate | 月別の入口ページTOP10・セッション数・エンゲージメント率 |

`SessionDate` は `2026-08-01`、`MonthYear` は `2026-08` の形式、件数・順位はJSONの数値です。未取得の行は含めず、実績が0の場合は0を入れます。日付重複、負数、不正な日付などは読み込みエラーとして表示します。

`EngagementRate` は0〜1の数値を指定します（例：`0.473684` → 画面で `47.4%`）。`MonthlyOverview` は1か月につき1行、入口ページは同じ月・順位の重複を避けます。同じURLが別順位で含まれる場合は、合算や再順位付けをせず取得元どおりに表示し、画面に注記します。提供データにはこのケースがあるため、集計元で区分・URL加工の条件を確認してください。

## ローカルで起動する

Node.js 20以降を使用します。外部パッケージのインストールは不要です。

```powershell
cd D:\work\javascript\nasuton-analytics-dashboard
npm run dev
```

ブラウザーで http://127.0.0.1:4173 を開きます。終了はターミナルで Ctrl+C。`index.html` の直接ダブルクリックではブラウザーの制限でJSONを取得できないため、HTTPサーバーを使用してください。

JSON未配置時は案内を表示します。配置後は「再読み込み」を押してください。一部のファイルだけ読み込めない場合も、他のグラフは利用できます。ファイル取得は15秒でタイムアウトします。

## 画面と集計

- 初期表示はデータに含まれる最新月。対象年・対象月を共通で選択します。
- 月次サマリーには選択月の総PV・アクティブユーザー数・新規ユーザー数・エンゲージメント率を表示します。グラフの指標を選ぶと、選択年の1〜12月の棒グラフに切り替わります。エンゲージメント率の軸は0〜100%です。未取得の月は0に置き換えません。
- サマリーの人数・率はJSONの月単位の値をそのまま使用し、年間合計や単純平均にはしません。月の収録日数はこのJSONに含まれないため、月次の完全性は判定していません。
- 入口ページTOP10はRank順でセッション数を横棒表示し、表とツールチップにはエンゲージメント率も表示します。TOP10の合計をサイト全体のセッション数にはしません。
- 月別セッションは日別データから合計します。棒またはデータ表のボタンで月を選べます。
- 月間セッション、前月比、前年同月比を表示します。比較率は両月の全日分が揃い、比較元が0でない場合のみ算出します。
- 部分的な月の合計には注記を付け、月別グラフでは黄土色で示します。例：2024年4月は16日からのデータ。
- 国別・流入元別はアクティブユーザー数です。分類を合算してサイト全体の人数にはしません。月の人数を合計して年間人数にも変換しません。
- 人気ページはRank順の上位5件で、PVと記事リンクを表示します。圏外ページのPVは算出しません。サイト全体のPVは、別途MonthlyOverviewのScreenPageViewsを使用します。
- 日別グラフは選択月の末日まで表示。未取得は空欄（内部ではnull）、実績ゼロは0。土日を淡い色で示します。
- グラフには数値表も用意しています。記事リンクはHTTP/HTTPSのみ有効です。
- データ更新日時はJSONに含まれていないため、画面では収録期間を表示します。

## GitHub Pagesへ配置する

1. このフォルダーの内容をGitHubリポジトリのルートへ登録します。`index.html` と同じ階層に `css/`, `js/`, `vendor/`, `data/` を配置します。
2. 表示したい6つのJSONも `data/` に登録します。
3. リポジトリの **Settings → Pages → Build and deployment** で **Deploy from a branch** を選択し、使用するブランチの **/(root)** を指定して保存します。
4. デプロイ完了後、PagesのURLを開きます。

相対URLを使用しているため `https://<owner>.github.io/nasuton-analytics-dashboard/` のようなリポジトリ配下でも動作します。`.nojekyll` を同梱しています。公開PagesのJSONは閲覧者が取得できます。公開可能な集計データだけを置いてください。

この初期設定ではGitリポジトリの初期化、push、GitHub Pagesの公開操作は行っていません。

## 将来APIへ切り替える

`js/config.js` の `mode` を `'api'` にして、`api` の6つのURLを設定します。各APIは現在のJSONと同じ配列・項目名を返す想定です。取得条件はまず全期間を想定しており、年月の絞り込みはブラウザー側で行います。

応答形式が `{ data: [...] }` の場合などは `js/data-source.js` で取り出します。グラフ描画や集計は独立しているので変更不要です。別ドメインのAPIはPagesのオリジンからのCORSを許可してください。SQLの接続情報や秘密のAPIキーはフロントエンドに置かず、API側で管理します。

## ファイル構成

```text
index.html           画面
css/style.css        スタイル・レスポンシブ対応
js/config.js         JSON/APIの取得先
js/data-source.js    取得・検証・エラー処理
js/model.js          月次集計・比較率・日付処理
js/charts.js         棒グラフの共通描画
js/app.js            年月選択・画面更新
data/                JSON配置先
vendor/              Chart.js 4.5.1 とライセンス
scripts/serve.mjs    ローカル確認用サーバー
test/model.test.js   集計の検証
```

`npm test` で欠損日・うるう年・部分月・比較率・重複検証などを確認します。Chart.jsはMITライセンスで、配布物を `vendor/` に同梱しています（実行時のCDN接続は不要）。
