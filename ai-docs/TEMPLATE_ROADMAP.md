# Template Implementation Roadmap

## Goal

現在の処理系は `vector<T>`、`map<K,V>`、`pair<T,U>`、`tuple<T...>`、`greater<>`、`make_pair`、`make_tuple`、
`get<I>`、明示テンプレート実引数つき関数呼び出し（`f<int>(x)`）を、汎用 template AST と stdlib dispatcher の上で扱う。

最終目標は、この特例依存をやめて、

- 一般の `template<...>` 宣言
- `foo<int, string>` のような一般の template-id
- 関数テンプレート / クラステンプレートの実体化
- 標準ライブラリ相当の定義を別モジュールに分離

を扱える構造へ移行することである。

ただしクラス/変数テンプレート、部分特殊化、完全なオーバーロード解決までは未到達であり、
競プロ向けサブセットとして必要な範囲に実装を絞っている。

## Why This Needs A Rewrite

現在も残る制約は以下。

- クラステンプレートと変数テンプレートは未対応
- 部分特殊化、明示特殊化、完全なオーバーロード解決は未対応
- `sort` / `reverse` / `fill` は iterator ベースになったが、依然として full-range `begin()/end()` に限定している
- `vector` 宣言は `VarDeclNode` に統合済み（`VectorDeclNode` は削除済み）
- `__iterator` は内部 template type として導入しているが、ユーザー定義 iterator までは扱わない

このため、真面目にテンプレートをやるには「既存の専用型を少し足す」のではなく、
テンプレートとシンボル解決の中間表現を導入する必要がある。

## Phase Plan

## Current State

- parser は一般の `TemplateInstanceType` と `TemplateCallExpr` を持つ
- 関数テンプレートは型推論呼び出しだけでなく、`f<int>(x)` のような明示テンプレート実引数呼び出しも扱う
- `pair.first` / `pair.second` は member access として扱い、lvalue 代入も可能
- `vector.begin()` / `vector.end()` は内部 iterator を返し、`sort` / `reverse` / `fill` はその iterator を受け取る
- stdlib checker/evaluator は registry 経由で dispatch され、core 側の直書き分岐を持たない

## Remaining Work

### 1. Class Template Instantiation

- `template<typename T> struct Foo { ... };` 相当の表現と実体化キャッシュ
- テンプレートクラスのメンバー解決

### 2. Overload Resolution And Specialization

- 関数テンプレート同士、通常関数との優先順位
- 部分特殊化、明示特殊化

### 3. Iterator And Algorithm Expansion

- subrange iterator、固定長配列 iterator、比較器一般化
- iterator category や差分計算の導入

## Non-Goals

- 後方互換のために旧 parser 特例や AST 形依存を残し続けること
- `template` 構文だけ受理して意味論を後回しにすること
