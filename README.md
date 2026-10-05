# aikatsu-encore

アイカツアンコールのカードを手動で記録する、日本語のローカルテスト版です。所持枚数・譲れる枚数・欲しい状態を管理し、JSONでバックアップ・復元できます。

公式サイトの公開一覧を弾別に収録し、所持・譲求を管理できます。収録範囲・件数・出典・取得日は画面に表示します。カード画像はローカルキャッシュを利用し、未取得でも番号とメタデータで操作できます。QR読取・友人との共有や同期は未対応です。API・ログイン・クラウド設定は不要です。

## ローカルで起動

Node.js **22.13.0以上**と **pnpm 11.19.0**を用意し、クローンしたリポジトリのルートで実行してください。確認環境はNode.js 24.19.0 / pnpm 11.19.0です。

```sh
pnpm install --frozen-lockfile
pnpm catalog:fetch
pnpm dev
```

自分のPCのブラウザで **http://127.0.0.1:5173** を開きます。終了はターミナルで `Ctrl+C`。WindowsのPowerShell／コマンドプロンプトでも同じコマンドを使えます。

`catalog:fetch` は公式画像を取得し、hashを検証してローカルキャッシュに保存します。取得済みの画像は再利用します。画像を取得できなくても、`pnpm dev` で番号・メタデータの管理を試せます。

pnpmが未導入なら、Node.jsのインストール後に `npm install --global pnpm@11.19.0` で導入できます。

## 検証

```sh
pnpm typecheck
pnpm test
pnpm catalog:validate
pnpm build
pnpm test:e2e
```

ブラウザテストは `/usr/bin/chromium` があれば利用します。それ以外では、先に `pnpm exec playwright install chromium` を実行してください。

保存先はブラウザのIndexedDBです。ブラウザ・端末・ホスト名・ポートごとに保存先が異なり、ブラウザのデータ消去で失われます。定期的に「バックアップ」からJSONを保存してください。タブ間同期は未実装なので、同じ保存先を複数タブで同時編集しないでください。

画像キャッシュの準備・取得状況・カタログ更新は [カタログ運用](docs/catalog-operations.md)、詳しい操作は [ローカル開発](docs/local-development.md) を参照してください。画像は公式サイト由来で、このリポジトリには同梱せずGit管理外のローカルキャッシュに保存します。

GitHub Pagesでのテスト公開用ビルドは `pnpm build:pages`。公式画像を含めず、番号・メタデータで操作できます。公開設定・確認方法は [静的ホスティング](docs/static-hosting.md) を参照してください。
