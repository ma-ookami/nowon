# Now ON 公開手順(GitHub Pages + Firebase)

Now ON を公開する手順です。所要時間は20〜30分くらいです。費用はかかりません(どちらも無料枠で使えます)。
ますせん・ケージバンとは別の Firebase プロジェクトを作ります(データもルールも完全に分かれます)。

## このフォルダのファイル

| ファイル | 役割 |
|---|---|
| `index.html` | アプリ本体(画面の骨組み。下の css・js を読み込む) |
| `css/style.css` | 見た目 |
| `js/base.js` | 定数(8色・30人・朝5時)・状態・日付・色の道具 |
| `js/music.js` | 音楽リンクの見分け・曲の確認(Apple・Spotify・YouTube)・試聴 |
| `js/data.js` | 今日の購読・3色を決める・曲を置く・となりのグループ・ランキング・きろく |
| `js/render.js` | 画面の描画 |
| `js/events.js` | 色を選ぶ・曲を探す・通報・設定などの操作 |
| `js/boot.js` | Firebase との接続・新しい版の確認・テーマ・共有で開いたとき・起動 |
| `firebase-config.js` | Firebase の設定(手順4で貼り付ける)と App Check のキー |
| `firestore.rules` | データを守るルール(手順3で貼り付ける) |
| `manifest.webmanifest` | ホーム画面に追加したときの名前・色・共有メニューの設定 |
| `icon-192.png` / `icon-512.png` / `apple-touch-icon.png` | ホーム画面のアイコン |
| `images/` | 確認用の画像(Git にも公開サイトにも入らない) |
| `README.md` / `OVERVIEW.md` | この手順書 / アプリの概要 |

GitHub にアップロードが必要なのは、`index.html`・`css` フォルダ・`js` フォルダ・`firebase-config.js`・`manifest.webmanifest`・アイコン3つです。`firestore.rules` は Firebase の画面に貼り付けて使います。

---

## 1. Firebase のプロジェクトを作る

1. https://console.firebase.google.com を開き、Google アカウントでログインする
2. 「プロジェクトを作成」を押す
3. プロジェクト名に `nowon` などを入れて進む
4. Google アナリティクスは使わないので「オフ」にして、作成する

## 2. 匿名ログインをオンにする

ログイン操作をしなくても、端末(ブラウザ)ごとに見分けられるようにする設定です。通報への対応にも使います。

1. 左のメニューの「構築」→「Authentication」→「始める」
2. 「Sign-in method」(ログイン方法)タブを開く
3. 一覧から「匿名」を選び、「有効にする」をオンにして保存する

## 3. データベースを作ってルールを貼る

1. 左のメニューの「構築」→「Firestore Database」→「データベースを作成」
2. ロケーションは `asia-northeast1 (Tokyo)` を選ぶ(あとから変えられません)
3. 「本番環境モードで開始」を選んで作成する
4. 作成できたら「ルール」タブを開く
5. 最初から入っている文字をすべて消し、このフォルダの `firestore.rules` の中身をすべてコピーして貼り付ける
6. 「公開」を押す

## 4. 設定をコピーする

1. 左上の歯車マーク →「プロジェクトの設定」
2. 下のほうの「マイアプリ」で、ウェブのマーク `</>` を押す
3. アプリのニックネームに `nowon` などを入れて「アプリを登録」(「Firebase Hosting も設定する」のチェックは不要)
4. 表示されたコードのうち、`const firebaseConfig = { ... };` の `{ }` の中身をコピーする
5. このフォルダの `firebase-config.js` を開き、`window.FIREBASE_CONFIG = { };` の `{ }` の中に貼り付けて保存する

> この値は公開されても問題ありません。データは手順3のルールで守られています。

## 5. GitHub で公開する

1. https://github.com で右上の「+」→「New repository」
2. Repository name に `nowon` と入れ、**Public** を選んで「Create repository」
3. 「uploading an existing file」から、上の「アップロードが必要なファイル」をドラッグして置き、「Commit changes」
4. リポジトリの「Settings」→ 左の「Pages」→「Branch」で `main` と `/ (root)` を選び「Save」
5. 1〜2分待つと公開URLが出ます:`https://(あなたのユーザー名).github.io/nowon/`

(VS Code から使うときは、このフォルダはすでに `git init` 済みです。GitHub にリポジトリを作って push してください。)

## 6. 公開URLを Firebase に登録する

1. Firebase の「Authentication」→「設定」タブ →「承認済みドメイン」
2. 「ドメインの追加」で `(あなたのユーザー名).github.io` を追加する(新しいプロジェクトなので、ほかのアプリで追加済みでも必要です)

## 7. 動作確認

1. 公開URLを開き、3色を選ぶ
2. スマホや、パソコンのシークレットウィンドウで公開URLを開き、**同じ3色を順番を変えて**選ぶ
3. 「今日この3色を選んだ人 2人」になり、片方で置いた曲がもう片方にすぐ出れば完成です

---

## うまくいかないとき

| 表示 | よくある原因 |
|---|---|
| 「Firebaseの設定が読み込めませんでした」 | `firebase-config.js` を貼り付けていない、またはアップロードし忘れている |
| 「サーバーにつながりませんでした」 | 手順2の「匿名」がオンになっていない |
| 「データを読み込めませんでした」 | 手順3のデータベース作成、またはルールの「公開」がまだ |
| 「選べませんでした。スマホの時計が…」 | 端末の時計が10分以上ずれている。または朝5時ちょうどの切り替わり |
| 「保存できませんでした」 | ルールの貼り付けが途中で切れている。`firestore.rules` を丸ごと貼り直す |
| 曲が「確認できませんでした」 | Apple・Spotify・YouTube の公開情報が一時的に取れない。少し待って再度 |

## App Check を設定する(任意・無料枠を荒らされないように)

ますせんの README の「App Check を設定する」と同じ手順です。キーは Now ON のプロジェクトで新しく作り、
`firebase-config.js` の `window.APPCHECK_SITE_KEY = "";` に貼ってからアップロードしてください。
**アップロードして1日ほど使ってから「適用」を押してください。** 先に適用するとアプリが動かなくなります。

## 通報への対応(運営)

- 通報は Firestore の `reports` に入ります(`day`・`g`(プレイリスト)・`sid`(曲のID)・`why`)。
- 曲を消す:`days/<day>/groups/<g>/songs/<sid>` を Firebase の画面で削除する。
- 置いた人を止める:`days/<day>/owners/<sid>` の `uid` を見て、`banned` コレクションに、その `uid` をドキュメントIDにしたドキュメントを作る(中身は `why: "通報"` など何でもよい)。以後その端末は3色も曲も置けなくなります。

## ホーム画面に追加する

- **iPhone(Safari)**:共有ボタン(□に↑)→「ホーム画面に追加」
- **Android(Chrome)**:右上の「︙」→「ホーム画面に追加」。追加すると、**Spotify などの「共有」に Now ON が出る**ようになり、選ぶだけで曲が入ります。
- iPhone では共有メニューには出ません(アプリストアのアプリでないとできないため)。「リンクをコピー」して貼り付けるか、曲名で探してください。
- iPhone のホーム画面アプリは Safari とは別の端末として扱われます(3色はそれぞれで選ぶことになります)。

## アプリを更新するとき

1. 手元で確認する:このフォルダで `npx http-server -p 8080 -c-1` を動かし、http://localhost:8080 を開く
2. 変更したファイルを GitHub にアップロード(またはコミットして push)する。1〜2分で反映されます
3. `firestore.rules` を変えたときは、Firebase の「Firestore Database」→「ルール」に貼り直して「公開」も必要です

## 色を12色に増やすとき

`js/base.js` の `COLORS` に4色を足し、`firestore.rules` の `comboOk` の `[0-7]` を `[0-9AB]` のような形に変える必要があります(番号が2桁になるので、そのときは相談してください)。
1グループの人数(30人)を変えるときは、`js/base.js` の `GROUP_MAX` と `firestore.rules` の `groupFor` の `30.0` を同じ数にします。
