# 静的ホスティングのテスト公開

GitHub Pages向けに、107種のカード情報と所持・譲求・バックアップ機能を公開する。
公式カード画像は転載禁止の表示があるため、テスト公開には含めない。
ローカル画像キャッシュが存在するPCでビルドしても、公開用成果物にはコピーされない。
公開画面ではカード番号と「テスト公開では画像を掲載していません」を表示し、画像取得リクエストを送らない。

## 公開用ビルドと確認

```sh
pnpm install --frozen-lockfile
pnpm build:pages
pnpm preview:pages
```

確認先は `http://127.0.0.1:4173/aikatsu-encore/`。成果物は `apps/web/dist-pages`。
`build:pages` は型検証、Pages専用ビルド、公式画像の混入がないこととJS/CSSの参照パスの検証を行う。
通常の `pnpm build` の出力 `apps/web/dist` は、ローカル画像を含む場合があるため公開には使用しない。

## GitHub Pagesの有効化

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
2. **Actions → Publish test site → Run workflow** で `main` を選んで実行する。
3. buildとdeployが成功したことと、deploy結果のURLで画面を開けることを確認する。

`.github/workflows/pages.yml` はmainへのpushでも実行される。公開用ビルドのみをアップロードし、画像取得CLIを実行しない。
GitHub側の標準 `GITHUB_TOKEN` を使い、追加の秘密情報や別のホスティングアカウントは用意しない。
想定する公開URLは `https://yuyuyu855.github.io/aikatsu-encore/`。workflowと実際のURLで確認するまで公開済みとは扱わない。

この環境ではGitHub APIと公開URLへのアクセスがproxyの403で拒否されたため、Pages設定・公開状態は確認できていない。
Gitのリポジトリアクセスと、APIや公開サイトへのアクセスは別の経路として扱う。

## 保存データの移行

保存先は公開URLのブラウザ内IndexedDBで、サーバーへ所持データを送信しない。
ローカルURLの保存データは別オリジンのため、そのまま公開URLには現れない。
ローカル側でJSONを保存し、公開側のバックアップ画面から確認・復元する。
公開側も端末・ブラウザごとに別データであり、友人との共有・同期は行わない。

## 今回の検証結果

ローカル画像キャッシュ214枚が存在する状態で `pnpm build:pages` を実行し、公開成果物はHTML・JS・CSSの3ファイル、公式画像バイナリ0件であることを確認した。
`pnpm test:e2e:pages` の公開用ブラウザテスト3件と、`pnpm test:e2e` のローカル用12件が成功した（スキップ0件）。
公開用では `/aikatsu-encore/` のJS・CSS読込み、画像リクエストなし、所持データの保存・再読込み、JSONバックアップ、弾別件数、375pxの表示を確認した。
GitHub側でのworkflow実行と公開URLの確認は、Pages設定を有効化してから行う。
