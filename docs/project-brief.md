# aikatsu-encore プロジェクト方針

## 目的と確定条件

バンダイナムコのデータカードダス「アイカツアンコール」のカードを、本人と友人が
スマートフォンで管理する。10月8日稼働予定という情報はユーザー申告で、公式確認は未完了。
所持カードを記録し、欲しいカードと譲れるカードを整理することを最初の成功条件とする。

- 継続的なインフラ費用ゼロを目標とする。有料契約は承認されていない。
- 日本語のスマートフォン向けPWAを第一候補とし、モノレポで管理する。
- PMが設計・レビュー・作業指示を担当し、調査・実装はGPT-6.1-solに委任する。
- 2026-10-05時点で設計・調査とローカルテスト用starterを追加・検証済み。公開は未実施。

## 参考から確認できたこと

参考投稿: https://x.com/ny7noa/status/2106738878384308249
投稿自体はプロキシのCONNECT 403で取得できなかったが、ユーザー提供の4枚の画像を確認した。

| 画面・操作 | 確認内容 |
| --- | --- |
| カード一覧 | 名前・番号検索、絞り込み、番号順、取得種類の表示、所持枚数の増減 |
| 譲求 | 譲れる枚数の増減、欲しいフラグ、譲求タブ |
| QR | カメラ・写真、記録する／しない、店舗・筐体メモ |
| 履歴 | 読取履歴／配列、CSV、全消去 |

表示例は `E1-01 PR オーロラキスキャミソール`、`E1-02 PR オーロラキスドレープスカート`。
「85種中2種取得」は画像の表示値であり、公式の全カタログ数が85と確認できたわけではない。
「配列」の意味、QRの実形式、カード番号とコードの対応は未検証。
公式サイトもプロキシ403で、公式からの全件のカードデータと画像は取得できていない。
第三者の公開実装には85件の候補データと97枠の別辞書があり、公式全件数の根拠にはしない。
詳細は [aikatsu-research.md](aikatsu-research.md)。出典・検証状態と対象弾／プロモを分けて扱う。

## MVPと未確定事項

MVPの核は手動検索・登録、所持枚数と所持種類率、欲しい／譲れるの管理、JSONによる全バックアップ・復元。
詳しい振る舞いは [product-design.md](product-design.md) に記す。
QR読取は実物形式の調査を先行させ、未確認の対応辞書やダミー読取を完成機能として扱わない。

友人への共有希望は質問中で、回答は未取得。仮案は明示選択した譲求だけを身内に公開し、
候補を閲覧する方式。既定は非公開で、所持全件、読取履歴、店舗・筐体メモは共有しない。
交換予約・承諾・完了による在庫自動移動は後段。同期は構成候補で、実装・採用決定は未完了。

## 構成の判断

TypeScript、pnpm workspace、React／Viteの `apps/web`、数量・スキーマ・純粋関数を担う
`packages/domain` のローカルstarterを追加し、端末内のIndexedDBへ保存する。
参考画像で表示を確認できたサンプル2カードのみを収録し、全カタログやQR対応辞書は未実装。
クラウドAPI・認証・共有・QR読取・PWAのService Workerは未実装。
今回の端末内保存はローカルで試すための範囲であり、友人との最終共有方式を決めたものではない。
実際の起動手順・テスト結果は [README](../README.md) と [local-development.md](local-development.md) を参照する。
バックエンドが必要と決まるまで空の `apps/api` は作らない。

以下は今後の共有・配信構成候補であり、現在のstarterの保存方式とは区別する。

| 利用方式 | 保存・配信候補 | 選択条件 |
| --- | --- | --- |
| アプリ内で友人と譲求共有 | Hono、Cloudflare Workers／D1、Access | 仮の基本案。共有方式と認証条件の確定後 |
| 各自の端末内で管理 | IndexedDBと無料静的配信、APIなし | アプリ内共有が不要なら選ぶ代替案 |

オンライン共有を採用する場合は単一オリジンで静的アセットとAPIを配信し、サーバーをデータの正本とする。
そのMVPの変更はオンラインで行い、オフライン編集・同期は後段。独立した二つの正本を作らない。
PWAとして使えることとオフライン編集は別であり、Accessログインとサーバー保存にはネット接続が必要。
Accessは具体的なメールアドレスの許可を候補とする。Freeでも現行手順では支払情報が必要なため、採用は暫定。
無料枠・上限到達時の挙動を採用時に公式情報と実アカウントで確認し、将来にわたる費用ゼロは保証しない。

確認先: [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、
[Workers制限](https://developers.cloudflare.com/workers/platform/limits/)、
[D1料金](https://developers.cloudflare.com/d1/platform/pricing/)、
[D1制限](https://developers.cloudflare.com/d1/platform/limits/)、
[Access連携](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、
[Zero Trust設定](https://developers.cloudflare.com/cloudflare-one/setup/)。
前回は公式ドキュメントのソースでAccess連携と支払情報の条件を確認したが、最新の枠の数値は未確定。

## 成果物と状態

- 要件整理・MVP設計: 本文書と [product-design.md](product-design.md) に反映済み。共有方式は未確定。
- 実装指示: [implementation-plan.md](implementation-plan.md) に受入条件と現在のローカル実装範囲を記載。
- 競合調査: [benchmark.md](benchmark.md) に集約済み。
- ゲーム固有調査: [aikatsu-research.md](aikatsu-research.md) を作成済み。候補データの公式照合は未完了。
- ローカルstarter: React／Vite、pnpm workspace、domain、IndexedDB保存を実装・検証済み。
  frozen install、型チェックを含むビルド、domainテスト、system Chromiumでのブラウザテストが合格。
  保存・再読み込み、無効な復元／保存中断時の既存データ保持、バックアップ復元、375px表示を確認済み。
  ローカル開発サーバーも起動確認済み。再現手順と詳細はREADME／local-developmentを参照する。
- 再利用用install_script／start_skillはドラフト保存済み。公開は未実施。
