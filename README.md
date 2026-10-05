# aikatsu-encore

アイカツアンコールのカードを手動で記録する、日本語のローカルテスト版です。所持枚数・譲れる枚数・欲しい状態を管理し、JSONでバックアップ・復元できます。

掲載はユーザー提供画像で確認した **E1-01 / E1-02 の2種だけ**です。公式の全件カタログ・カード画像・QR読取・友人との共有や同期は未対応です。API・ログイン・クラウド設定は不要です。

## ローカルで起動

Node.js **22.13.0以上**と **pnpm 11.19.0**を用意し、クローンしたリポジトリのルートで実行してください。確認環境はNode.js 24.19.0 / pnpm 11.19.0です。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

自分のPCのブラウザで **http://127.0.0.1:5173** を開きます。終了はターミナルで `Ctrl+C`。WindowsのPowerShell／コマンドプロンプトでも同じコマンドを使えます。

pnpmが未導入なら、Node.jsのインストール後に `npm install --global pnpm@11.19.0` で導入できます。

## 検証

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

ブラウザテストは `/usr/bin/chromium` があれば利用します。それ以外では、先に `pnpm exec playwright install chromium` を実行してください。

保存先はブラウザのIndexedDBです。ブラウザ・端末・ホスト名・ポートごとに保存先が異なり、ブラウザのデータ消去で失われます。定期的に「バックアップ」からJSONを保存してください。タブ間同期は未実装なので、同じ保存先を複数タブで同時編集しないでください。

詳しい操作と注意点は [ローカル開発](docs/local-development.md)、将来の機能設計は [プロダクト設計](docs/product-design.md) を参照してください。
