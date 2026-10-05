# アイカツアンコール：公開情報・同ゲーム管理アプリ調査

調査日：2026-10-05。公開ソースを読んで確認した内容で、外部コードは実行していない。ユーザー提供画像の参考アプリと以下の作者・リポジトリが同一であるとは確認できていない。

## 初期調査時の公式情報と未確認事項

- 「10/8稼働開始」はユーザーからの情報として扱う。年は推定しない。
- ユーザー提供画像には「85種」、`E1-01 / PR / オーロラキスキャミソール`、`E1-02 / PR / オーロラキスドレープスカート`がある。全カード総数や対象弾は公式未確認。
- 下記の公開コードから[公式カード一覧候補](https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629001&display=1&sort=1)のURLを得たが、直接アクセスはプロキシの `403 Forbidden` で本文を取得できなかった。[アイカツ！サイト](https://www.aikatsu.com/)・[カードダス](https://www.carddass.com/)も同じ理由で取得できなかった。
- 裏面の「2次元コード」がQRか他の規格か、文字列の仕様、カード番号との対応、個体識別の有無は未確認。「QR」タブの表記だけで規格や自動特定の動作を断定しない。

## 同じゲームの公開管理アプリ

### mmmmmy0866/aikatsu-encore

[リポジトリ](https://github.com/mmmmmy0866/aikatsu-encore) / [確認したHTML](https://raw.githubusercontent.com/mmmmmy0866/aikatsu-encore/main/aikatsu_encore.html)

- カード名・写真・所持枚数を手登録し、枚数の増減・削除・お気に入り・名前検索・0枚フィルターに対応する実装。
- 写真はファイル入力から読み込み、長辺最大900pxのJPEGへ縮小し、カード情報とともに `localStorage` に保存する。
- 内部IDは登録時刻で生成する。ゲームのカード番号や事前登録カタログは確認できない。
- 読んだ単体HTMLにはQR/バーコード読取、CSV、譲・求、履歴・配列の実装を確認できなかった。写真の追加はコード解析とは別機能。

### DAKKI3594/aikatsu-encore-comp-checker

[リポジトリ](https://github.com/DAKKI3594/aikatsu-encore-comp-checker) / [確認したHTML](https://raw.githubusercontent.com/DAKKI3594/aikatsu-encore-comp-checker/main/index.html) / [公開ページの設定](https://dakki3594.github.io/aikatsu-encore-comp-checker/)

- カード番号検索、所持・欲しいものフィルター、所持状態・枚数・譲枚数・求、コンプリート率、所持/欲しいものリストの画像化、端末内保存の実装を確認。
- Google AuthとFirestoreにユーザーごとのデータを読み書きするコードがある。公開ページでログイン・同期が動くか、データベース設定や共有機能は検証していない。
- `cardsE1` に `E1-01`〜`E1-85` の85件の番号・名前・埋込WebP画像がある。加えて `E1-1P` 等の名前・画像がない12枠があり、計97枠。後者の意味・公式なカード実在は未確認。初期HTMLの「0 / 85」と辞書の件数を同一視しない。
- 2〜6弾・プロモーションの選択肢はあるが、読んだ版では各辞書は空配列。
- 読んだHTMLにはQR/バーコード読取、CSV、履歴・配列の実装を確認できなかった。埋込画像・辞書の出典、正確性、再利用条件は未確認。

### kaito-miho/aikatsu-encore-manager

[リポジトリ](https://github.com/kaito-miho/aikatsu-encore-manager) / [確認したApp.jsx](https://raw.githubusercontent.com/kaito-miho/aikatsu-encore-manager/master/src/App.jsx) / [cards.json](https://raw.githubusercontent.com/kaito-miho/aikatsu-encore-manager/master/public/cards.json) / [取得スクリプト](https://raw.githubusercontent.com/kaito-miho/aikatsu-encore-manager/master/scrape-test.js) / [公開ページの設定](https://kaito-miho.github.io/aikatsu-encore-manager/)

- React/Vite。JSONからカード候補を読み込み、カードを追加・編集、保有枚数変更、コーデの登録・一覧、タイプ・シリーズ・ブランド・レアリティによる絞り込み、`localStorage` 保存の実装を確認。
- カード候補の選択から番号・レアリティ・画像URLを設定し、カード名等は入力する構成。
- `public/cards.json` は85件。フィールドは `cardNumber`・`rarity`・`imageUrl` の3つで、名前はない。例：`E1-01_PR`、`PR`、`https://dcd.aikatsu.com/encore/images/cardlist/card/E1-01_PR.webp`。
- 取得スクリプトは上記カード一覧URLから `images/cardlist/card/(E1-\d{2}_[A-Z]+)\.webp` を抽出してJSON化するコード。今回は実行していない。公開JSONが公式一覧と一致すること、抽出が網羅的であること、利用許諾は確認できていない。
- 作者が `cardNumber` と呼ぶ値には `_PR` 等のレアリティが付く。アプリの表示番号 `E1-01` と画像識別子 `E1-01_PR` は分けて保存する設計がよい。この接尾辞は裏面コードの仕様を示さない。
- 読んだApp.jsxにはQR/バーコード読取、CSV、譲・求、履歴・配列の実装を確認できなかった。READMEはReact/Viteのテンプレート。

## プリマジの補助例

- [PriMagi Code Manager](https://github.com/mmmngit/pmcm)：READMEに、マイページのアイテムブックでブックマークレットを実行する手順がある。リポジトリはMITライセンス。公式マイページからの連携方法の参考だが、カメラ読取やアイカツのコード対応とは確認できていない。
- [ワッチャプリマジ！ アイテムリスト](https://github.com/pgrho/primagi-items)：READMEに章別一覧、アイテムCSV/TSV、マイキャラパーツ、遊べるお店CSV/TSVがある。カタログを所持データと分けてCSV取込する設計の参考。公式配布や再利用許諾は確認できていない。

## 今回の設計への反映

- 公開例の比較から、本人/友人向けには所持・譲・求の同時保持、履歴・バックアップ、カード番号による検索が有用。コーデ管理やお気に入りは追加候補。
- 公開辞書85件の存在は分かったが、公式確認済みデータとしてそのまま採用しない。画像も転載しない。ユーザーが確認したカード情報の手登録・CSV取込を用意し、出典・確認状況を残せるようにする。
- 番号、レアリティ、画像識別子、内部ID、裏面コードの読取結果は別項目にする。実物のサンプルで規格・対応を確認するまで、スキャンからカードを自動特定できると表示しない。

初期の公開コード調査ではGitHub検索APIは403、通常のGitHub検索ページは一部200。その後429が出たため検索は終了し、特定済みソースを通常の `raw.githubusercontent.com` から必要な分だけ確認した。プロキシ回避・外部コード実行・カード画像の保存や転載は行っていない。


## 2026-10-05の公式再取得と実装への反映

公式一覧の再取得はHTTP 200で成功した。公式の公開弾選択肢を調べ、第1弾（series=629001）85件とプロモーション（series=629901）22件、計107件を取得した。HTMLの掲載件数と解析件数は一致し、表・裏214画像を取得してhash・バイト数・WebPデコード・寸法を確認した。縦画像190点（460×670）、横画像24点（670×460）。

- 出典：[第1弾](https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629001&display=3&sort=1)／[プロモーション](https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629901&display=3&sort=1)。
- 公式HTMLには名称・パーツ・AP・ブランドのテキスト項目がなく、raw metadataの欠落値を保持した。公式カード画像の目視で全107件の名称・パーツ・APを確認し、補完情報の出典画像URL・hash・取得時期・確認したフィールドを別に保存した。ブランド表示がない53件は未設定として維持した。
- データ・出典は `packages/catalog/data`、画像はGit管理外の `apps/web/public/cards` に配置した。公式サイトの転載禁止表示に合わせ、画像をGitへ含めず、取得manifestと再取得・検証ツールを管理する。
- アプリは弾選択・収録範囲の動的分母・ローカル表裏画像・番号／名前検索に対応し、旧2件のIDと在庫を維持する。バックアップは表示弾と独立した全登録IDが対象。
- 未公開弾の件数やID、裏面コードの規格・ペイロード・対応は推測していない。全公開一覧の取得は、QR読取が使えることや今後の未公開カードの収録を意味しない。

詳細な配置・取得コマンド・更新時の在庫保持は [カタログ運用](catalog-operations.md) を参照する。初期調査の403結果と第三者候補は歴史的な調査記録として上に残し、現在の公式取得根拠とは区別する。
