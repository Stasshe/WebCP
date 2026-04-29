# 開発ガイドライン

## 実装優先ディレクティブ

- `SPECIFICATION.md` だけを見て広く薄く実装しない。実装順序と必達条件は `IMPLEMENTATION_DIRECTIVES.md` を優先して従う
- 新機能を入れるときは、まず `IMPLEMENTATION_DIRECTIVES.md` にあるゴールデンプログラムを確認する
- ゴールデンプログラムに必要な機能は、parser / semantic / runtime / debugger / tests / docs を同一変更で揃える
- ai-docsのドキュメントも、必要であろう時、事前に読んでおけ
- 仕様以下の実装をするな。表面的な変更で済ますな。
- ファイルが短いのは良い。ファイルは多くてもかまわないが、長すぎるファイルをつくるな。
- 実装対象が広すぎる場合は、`SPECIFICATION.md` を増やす前に `IMPLEMENTATION_DIRECTIVES.md` の受け入れ条件を具体化する

## テンプレート実装

- テンプレート関連は parser の既知名分岐を増やさず、一般の template-id / template-type として受理してから `stdlib/` と template instantiation で解決する
- 標準ライブラリ風機能は evaluator / validator 直書きではなく、`stdlib/metadata.ts` と stdlib handler に寄せる
- `pair.first` のようなメンバー、`map.size()` のようなメソッド、`vector.begin()/end()` が返す iterator を C++ 風の形で表現し、legacy な AST 形特例を増やさない

## ディレクトリ構造

```
src/
├── index.ts
├── compiler.ts
├── diagnostics.ts
├── preprocessor.ts
├── types.ts
├── parser/
│   ├── index.ts
│   ├── lexer.ts
│   ├── expression.ts
│   └── base/
│       ├── index.ts
│       ├── core.ts
│       ├── type-support.ts
│       └── support.ts
├── runtime/
│   ├── errors.ts
│   └── value.ts
├── interpreter/
│   ├── index.ts
│   ├── evaluator.ts
│   ├── builtin-eval.ts        ← stdlib dispatch への薄い橋渡し
│   └── runtime/
│       ├── index.ts
│       ├── core.ts
│       ├── type-support.ts
│       └── support.ts
├── semantic/
│   ├── validator.ts
│   ├── builtin-checker.ts
│   ├── template-instantiator.ts  ← 型引数推論・単相化・substituteExpr
│   ├── type-compat.ts
│   └── type-utils.ts
├── stdlib/
│   ├── metadata.ts
│   ├── template-exprs.ts
│   ├── template-types.ts
│   ├── check-registry.ts
│   ├── eval-registry.ts
│   ├── check-context.ts
│   ├── eval-context.ts
│   ├── vector-methods.ts
│   ├── map-methods.ts
│   ├── pair-members.ts
│   ├── check/
│   │   ├── index.ts
│   │   ├── factories.ts
│   │   ├── get.ts
│   │   ├── methods.ts
│   │   ├── range-algorithms.ts
│   │   ├── value-functions.ts
│   │   └── vector.ts
│   ├── eval/
│   │   ├── index.ts
│   │   ├── factories.ts
│   │   ├── get.ts
│   │   ├── pair-map.ts
│   │   ├── range-algorithms.ts
│   │   ├── value-functions.ts
│   │   └── vector.ts
│   └── builtins/
│       └── compare.ts
└── debugger/
    └── session.ts
```

## ファイル分割

- **1ファイル800行以内**（テストファイル含む）
- 超えそうになったら分割を先に検討する。分割単位は責務で決める、行数で決めない
- たとえ100行未満でも、責務がそこで完結するならそれでよい。増やすな
- 逆に、責務が複数にまたがるなら分割する。
- parser / interpreter のような中核モジュールは、入口の高レベル制御と低レベル支援を別ファイルに分ける
- さらに支援層が大きくなったら、型処理と storage/location 処理のようにデータ責務で分割する
- 診断整形は `diagnostics.ts` に集約する。compile/runtime/debugger でエラー文字列を個別実装しない

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
- エラー仕様を変えたら `README.md` も同時に更新する。ユーザー向けの診断例は実装とずらさない

## エラー実装

- compile error は GCC / Clang 形式の `main.cpp:<line>:<col>: error: ...` を既定とする
- runtime error は `Runtime Error: ...` に続けて leaf-first の stack trace を載せる
- `RuntimeErrorInfo` は整形済み `message` だけでなく、`summary`、`filename`、`stack` を持つ
- `RuntimeTrap` から `RuntimeErrorInfo` への変換は `diagnostics.ts` に寄せる

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
