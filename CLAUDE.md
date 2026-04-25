# 開発ガイドライン

## ディレクトリ構造

```
src/
├── index.ts
├── types.ts
├── parser/
├── runtime/
├── interpreter/
└── debugger/
```

## ファイル分割

- **1ファイル800行以内**（テストファイル含む）
- 超えそうになったら分割を先に検討する。分割単位は責務で決める、行数で決めない
- たとえ100行未満でも、責務がそこで完結するならそれでよい。増やすな
- 逆に、責務が複数にまたがるなら分割する。

## 型

### `any` / `unknown` の禁止

原則として使用しない。

```ts
// NG
function evaluate(node: any): any { ... }

// OK
function evaluate(node: ASTNode): Value { ... }
```

やむを得ない場合（外部ライブラリの型が不十分など）はコメントで理由を明記し、呼び出し境界で即座に型を絞り込む。

### linterを通すためだけの型付けをしない

型はドキュメントであり、設計の表明。エラーを消すことを目的とした型付けは技術的負債になる。

```ts
// NG：linterを黙らせるためだけのキャスト
const val = someMap.get(key) as Value;

// OK：undefinedを正しく扱う
const val = someMap.get(key);
if (val === undefined) throw new RuntimeError(`undefined variable: ${key}`);
```

### 型の narrowing を活用する

`Value` のような union 型は `switch` / `if` で明示的に絞り込む。

```ts
// NG
function add(a: Value, b: Value): Value {
  return { kind: "int", value: (a as any).value + (b as any).value };
}

// OK
function add(a: Value, b: Value): Value {
  if (a.kind !== "int" || b.kind !== "int") {
    throw new RuntimeError("type mismatch");
  }
  return { kind: "int", value: a.value + b.value };
}
```

## Lint / Format

- `biome check --write` を通してからコミットする
- lint エラーを `// @ts-ignore` や `// biome-ignore` で黙らせない。黙らせる場合はコメントで理由を書く

## 仕様同期

- 言語機能を追加・変更したら `SPECIFICATION.md` と `tests/` を同じコミットで更新する
- この処理系は「競プロで頻出の C++ 断片を安全に再現するサブセット」であり、C++ 全体の完全再現は目指さない
- ただし一度対応すると決めた機能は、糖衣構文だけでなく意味論・デバッグ表示・テストまで揃える

## モジュール間の依存方向

依存は一方向に保つ。循環依存は禁止。

```
parser → (なし)
runtime → (なし)
interpreter → parser, runtime
debugger → interpreter, runtime
index.ts → すべて
```

`runtime` は `parser` を知らない。`parser` は `runtime` を知らない。
責任・境界分離を明確に



Vitestを使用
Q: テストファイルの配置はどちらにする？
A: `tests/` に配置する
