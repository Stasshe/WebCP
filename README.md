# ClientSideCPP

TypeScript で実装した `ClientSideCPP` 本体と、GitHub Pages に静的配信できる Next.js playground を同じリポジトリで管理します。

## Structure

- `src/`: ライブラリ本体
- `tests/`: `vitest` テスト
- `apps/web/`: GitHub Pages 配信用の Next.js アプリ

## Setup

```bash
pnpm install
```

## Commands

```bash
pnpm run build
pnpm run test
pnpm run web:dev
pnpm run web:build
```

## GitHub Pages

`main` への push で `.github/workflows/deploy-pages.yaml` が `apps/web/out` を GitHub Pages へデプロイします。Project Pages の URL になるため、Next.js 側では GitHub Actions 実行時に `basePath` を自動で `/<repository>` に合わせています。
