# カードコレクション管理のベンチマーク

調査日: **2026-10-05**。目的は、アイカツアンコールのカードを身内で管理するアプリに使える設計パターンを探すこと。所持・重複・欲しい・譲れる・読取・復元を優先し、価格相場やデッキ構築は今回の優先外とする。

## 証拠の範囲

商用アプリの公式サイトはこの環境のプロキシが `Tunnel connection failed: 403 Forbidden` を返した。一方、通常のGitHub公開検索と公開README・ソースの読み取りは成功したため、実在を検索結果とリポジトリ本文で確認できた3件を比較した。別プロキシや接続制限の回避は使用していない。

- **README確認**: 開発者の記述を読めたという意味。正常動作を実証したという意味ではない。
- **ソース確認**: 対象コードやDBスキーマを静的に読めたという意味。APIや画面の動作確認ではない。
- **起動・試用**: 3件とも未実施。認識精度、操作感、端末互換性、バックアップ復元の成功は未検証。
- **未確認**: 閲覧した資料から判断できない。機能が存在しないという断定ではない。

公開リポジトリであることと、再利用可能なオープンソースライセンスであることは区別する。本調査は設計比較であり、コード再利用の許諾確認は行っていない。リンクは取得時のコミットに固定した。

## 参考画像をベースラインにした比較

参考画像について、カード図鑑、カード名・番号検索、フィルタ、種類の収集率、所持数の＋／−、譲れる数、欲しいフラグ、譲求一覧、カメラ・写真からの二次元コード読取、店舗・筐体メモ、読取履歴・CSVを比較の基準にする。「配列」タブは存在が読み取れるが、内容・意味は未確定。以下のMTG用アプリのデッキ表示とは結び付けない。

| アプリ・対象 | 所持・重複・欲しい・交換 | 読取 | オフライン・保存・復元 | 今回とのドメイン差 |
|---|---|---|---|---|
| **Pasta** / MTG、macOSネイティブ | 所持コピーの追加・編集・削除、数量集計、Wishlistから所持への移動をREADMEとRustソースで確認。デッキに割り当て済みか空きかを区別。譲れる数・交換相手一覧は未確認 | READMEにカメラ＋OCRのScannerは**未実装**と明記 | READMEにカードデータ取得後のオフライン動作とローカルSQLite・画像キャッシュを明記。デッキ書き出しは**壊れている**と明記。完全バックアップ・復元UIは未確認 | 「デッキ未割当」は「交換可能」と同じ意味ではない。収集率・店舗筐体・二次元コードには直接対応しない |
| **MTG Collection Manager** / leogaraph、MTG紙・Arena | READMEに実際の数量による紙・デジタル所持管理。SQLで共有カードカタログと利用者別の数量を確認。欲しい・譲れる・交換は未確認 | READMEに写真のpHash画像照合を記載。認識UIや精度は未検証 | READMEにローカルで稼働する構成、SQL backup/restore手順。backup.shにmysqldump実装を確認。ブラウザ単体のオフライン動作は未確認 | MySQL＋API＋UIの3コンテナであり、常時インフラ不要のスマホ中心アプリとは運用が異なる。Arena取得手段は今回の対象外 |
| **MTG Cards Image Detection & Collection Manager** / gruzdev-as、MTG紙 | Reactソースで所持数の＋／−、数量ソート、更新失敗時の再読込を確認。欲しい・譲れる・交換は未確認 | READMEにブラウザカメラ、上位5候補から選択。Reactソースで撮影→未登録の候補一覧→選択→登録API呼出しを確認 | READMEにローカルDocker Composeと初回数GBのモデル取得を記載。ブラウザ単体オフライン、CSV、バックアップは未確認 | カード絵の機械学習照合であり、二次元コードのデコードとは違う。価格更新・推論基盤は今回には重い |

3件とも、無料の所持件数上限や有料機能境界を確認できる料金資料は閲覧していない。ローカル稼働の説明は、共有サービスの継続費用がゼロであることや、無料利用が無制限であることを証明しない。比較対象に、実証された交換マッチング機能や店舗・筐体管理はなかった。

## 一次ソースと短い引用

### 1. Pasta

- [README](https://github.com/ofelipenavarro/pasta.cards/blob/5f1577d75dfc5357e33373a8af166b090d55aaa6/README.md): “it runs offline once the card data is downloaded.” 初回データ取得を条件にしたオフライン設計の説明。
- 同README: “Wishlist — add, remove, and ‘acquire’ straight into the collection.” Wishlistを所持へ移す導線。Known gapsにはScannerが “Not implemented”、Exportarが “Broken” と明示されている。UI上にある機能と完成している機能を分ける記述として参考になる。
- [collection.rs](https://github.com/ofelipenavarro/pasta.cards/blob/5f1577d75dfc5357e33373a8af166b090d55aaa6/desktop/src-tauri/src/routes/collection.rs): “Counts throughout the app are copies, never distinct names”。`collection_total`は`SUM(quantity)`と`COUNT(DISTINCT card_name)`を別々に返す。枚数と種類数を混同しない実装を確認した。
- [wishlist.rs](https://github.com/ofelipenavarro/pasta.cards/blob/5f1577d75dfc5357e33373a8af166b090d55aaa6/desktop/src-tauri/src/routes/wishlist.rs): “a wishlist entry is not cardboard”。`acquire_wishlist_entry`にcollectionへのINSERTとwishlistからのDELETE、`/api/wishlist/:id/acquire`ルートを確認した。動作・更新の原子性は未検証。

採用示唆: 所持種類数と総枚数を明確に分け、欲しいカードを所持として集計しない。入手時の状態更新を短い導線にする。ただし今回の「欲しい」は、既に1枚所持していても追加で欲しい場合を表現できるようにする。Pastaの「未所持」の説明をそのまま制約にしない。

### 2. MTG Collection Manager / leogaraph

- [README](https://github.com/leogaraph/mtg-collection-manager/blob/f98b4ac6372a143e70cfff36907740957280f8ad/README.md): “Coleção digital (Arena/MTGO) e física, com quantidades reais”〔紙・デジタルのコレクションを実際の数量で管理〕、“Scanner de cartas físicas por foto (pHash de imagem)”〔写真の画像ハッシュで紙カードを照合〕。
- [schema.sql](https://github.com/leogaraph/mtg-collection-manager/blob/f98b4ac6372a143e70cfff36907740957280f8ad/db/schema.sql): `cards`とは別に`collection_physical`を定義し、`user_id`、`card_id`、`quantity`、状態・仕上げ・言語・notesを保持。`UNIQUE KEY uq_physical_card (user_id, card_id)`を確認した。複数利用者の所持情報と共有カタログの分離を確認できる。
- [backup.sh](https://github.com/leogaraph/mtg-collection-manager/blob/f98b4ac6372a143e70cfff36907740957280f8ad/db/backup.sh): `mysqldump`に`--single-transaction --routines --triggers --no-tablespaces`を付けてSQLファイルへ保存。READMEにも復元手順と別媒体への保管を記載。復元スクリプトの実行はしていない。

採用示唆: 共通カタログと個人の状態を分ける。ローカルにデータがあるだけでは復元可能とは言えないため、完全なエクスポートとインポートをユーザーの操作として提供する。今回、SQLダンプやDocker操作を利用者に要求する必要はない。

### 3. MTG Cards Image Detection & Collection Manager / gruzdev-as

- [README](https://github.com/gruzdev-as/MTG-AI-Collection-Manager/blob/10cfc7b6668797451dca4f394a61df51c2e19880/README.md): “Top 5 Selection”、さらに “confirm the exact set and printing of your card”。照合候補をそのまま確定せず、利用者がカードの版を選ぶ説明。
- [ScannerTab.jsx](https://github.com/gruzdev-as/MTG-AI-Collection-Manager/blob/10cfc7b6668797451dca4f394a61df51c2e19880/frontend/src/pages/ScannerTab.jsx): `getUserMedia`、カメラ権限エラー表示、撮影プレビューとRetake、`pendingCards`、候補選択の`select`、最後の`api.addCardsToCollection`を確認した。画像の推論と所持登録が別段階になっている。推論サーバーの正常動作や結果の正確性は未検証。
- [CollectionManager.jsx](https://github.com/gruzdev-as/MTG-AI-Collection-Manager/blob/10cfc7b6668797451dca4f394a61df51c2e19880/frontend/src/pages/CollectionManager.jsx): `handleUpdateQty`が＋／−の更新をAPIへ送り、失敗時に一覧を再読込する。数量が1未満になると削除処理を呼ぶ。画面上の数量操作の実装を確認した。
- 同README: “the init service will download several gigabytes of models and indices”。画像照合のためのPostgreSQL、Redis、推論worker、モデル初期化、毎日の価格同期を説明している。

採用示唆: 撮影・読取と所持の登録を分ける。読めなかった場合の再試行、候補確認、誤登録の訂正を用意する。アイカツでは二次元コードの形式とカードIDへの対応が未確定なので、画像照合モデルが必要だとは結論しない。

## 今回に採用したいパターン

1. **種類数と枚数を分ける。** 図鑑の収集率は対象の異なるカードID数から算出し、総枚数とは別表示にする。カード名が同じ別番号・別版を合算してしまわない。
2. **所持・欲しい・譲れるを独立させる。** 所持2枚でも2枚とも残したい場合がある。「所持数−1」を譲れる数に固定しない。譲れる数は所持数を超えないようにする。欲しいは所持済みと両立させる。
3. **一覧上で素早く更新する。** 所持数の＋／−、欲しい、譲れる数を一覧で扱い、誤操作を戻せるようにする。保存失敗を成功したように見せない。
4. **読取結果を確認してから更新する。** 未知コード、同じカードを続けて読んだ場合、キャンセルを扱う。画像照合とコード読取の仕組みを混同しない。
5. **ローカル保存と復元を一緒に設計する。** 全状態・スキーマ版を持つバックアップ用JSON、読取履歴や譲求一覧を扱いやすいCSVで用途を分ける。CSVだけで全状態を復元できるとは表示しない。
6. **身内の共有は小さく始める。** まず譲求一覧のコピー・書き出しを整える。複数人の状態の自動照合・同期は、共有したい範囲と更新方法が決まってから設計する。この項目は競合の確認済み機能ではなく、今回の要件からの提案。

## 避けたい過剰機能と残る調査

相場・資産評価、毎日の価格同期、デッキ構築・勝率分析、公開マーケット・決済・配送、チャットを初期版の要件に加えない。今回の管理を複雑にし、外部データや運用基盤への依存を増やす。認識のための数GBのモデル・常時推論workerも、二次元コード形式の確認前には採用しない。

未確定なのは、アイカツアンコールの正式なカードID・二次元コード形式・同一カードの重複読取の意味、「配列」タブの用途、カードカタログの取得と更新方法、画像等の利用条件、身内の共有粒度。これらは他ゲームの機能から推定して確定させない。

## 商用候補の取得制限

Pokellector、Collectr、TCG Collector、ManaBox、Deckboxは比較候補として以下の公式サイトの読み取りを試行したが、すべてCONNECT 403となった。公式サイト本文を読めていないため、所持・交換・無料上限・課金・スキャン・オフライン・バックアップの仕様は本資料では未確認とする。

| 候補 | 読み取りを試みたURL |
|---|---|
| Pokellector | https://www.pokellector.com/ |
| Collectr | https://www.getcollectr.com/ |
| TCG Collector | https://www.tcgcollector.com/ |
| ManaBox | https://manabox.app/ |
| Deckbox | https://deckbox.org/ |

ManaBoxのApple掲載候補 https://apps.apple.com/us/app/manabox/id1460407674 も同じ制限だった。商用候補の知名度や過去の知識を根拠に、現在の機能・料金を断定していない。無料上限やエクスポートの課金は、公式本文を読める環境での追加確認対象。
