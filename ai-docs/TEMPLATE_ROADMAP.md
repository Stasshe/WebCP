# Template Implementation Roadmap

## Goal

現在の処理系は `vector<T>`、`map<K,V>`、`pair<T,U>`、`tuple<T...>`、`greater<>`、`make_pair`、`make_tuple` を
「テンプレートそのもの」としてではなく、個別の組み込み機能として扱っている。

最終目標は、この特例依存をやめて、

- 一般の `template<...>` 宣言
- `foo<int, string>` のような一般の template-id
- 関数テンプレート / クラステンプレートの実体化
- 標準ライブラリ相当の定義を別モジュールに分離

を扱える構造へ移行することである。

ただし「本物と限りなく同じ挙動」は、現在の AST / 型 / evaluator を部分修正して届く範囲ではない。
段階的な全面改修が必要になる。

## Why This Needs A Rewrite

現状は以下の制約がある。

- parser が `vector` / `map` / `pair` / `tuple` を名前で分岐している
- validator が `make_pair` / `make_tuple` / `greater` / `sort` を名前で分岐している
- evaluator が標準ライブラリ関数を名前で分岐している
- AST に「テンプレート宣言」「テンプレート引数」「依存名」「実体化済みシンボル」の概念がない
- 型が `VectorType` / `MapType` / `PairType` / `TupleType` の専用ノードで固定されている

このため、真面目にテンプレートをやるには「既存の専用型を少し足す」のではなく、
テンプレートとシンボル解決の中間表現を導入する必要がある。

## Phase Plan

### Phase 1: Name And Library Isolation

目的:

- 組み込みテンプレート風機能の名前をレジストリに集約する
- parser / validator / evaluator の散在したリテラル依存を止める
- 標準ライブラリを別ファイルへ逃がす土台を作る

完了条件:

- テンプレート関連の既知名が `src/stdlib/` 配下へ集約される
- 新しいテンプレート対応を追加するとき、名前の起点が複数箇所に散らない

### Phase 2: Generic Template AST

目的:

- `template<typename T> ...`
- `Foo<int>`
- `get<0>`

を、個別の `VectorType` / `TupleGetExpr` 特例ではなく、一般の template-id / template-arg AST で表現する

必要変更:

- `TypeNode` に一般の `NamedType` / `TemplateInstanceType` を導入
- `ExprNode` に一般の `TemplateCallExpr` または `TemplateIdExpr` を導入
- lexer / parser に `template`, `typename`, `class` などの構文を追加

### Phase 3: Symbol Table And Instantiation

目的:

- テンプレート宣言をシンボルとして保持する
- 実引数型に基づき単相化または実体化キャッシュを行う

必要変更:

- validator にテンプレートパラメータスコープを追加
- 具体化済みシンボルのキャッシュ層を追加
- 同一テンプレート + 同一引数列の再利用を導入

### Phase 4: Stdlib As Definitions

目的:

- `vector`, `pair`, `tuple`, `map`, `greater` を evaluator の if 文から外す
- 「組み込みオブジェクト」ではなく「標準ライブラリ定義 + 一部ランタイムプリミティブ」の形に寄せる

必要変更:

- `src/stdlib/` にライブラリ定義と runtime hooks を分離
- `sort` や `vector::push_back` のような操作を intrinsic と method metadata へ寄せる

### Phase 5: Compatibility Expansion

目的:

- 部分特殊化、オーバーロード解決、テンプレート引数推論などを順次実装する

注意:

- ここから先は C++ の複雑さが急増する
- 「競プロで頻出」を超えて、本物の C++ コンパイラ実装領域に入る

## Non-Goals For The Immediate Next Change

次の 1 変更でやるべきではないこと:

- 既存の `VectorType` / `MapType` / `PairType` / `TupleType` を無計画に削除する
- parser だけ一般化して validator / evaluator を放置する
- `template` キーワードを受理するだけで実体化がない状態をマージする

## Current Direction

今後の直近の実装方針は以下。

1. `src/stdlib/` に標準ライブラリの名前・メタデータ・intrinsic を集約する
2. parser で一般の template-id を持てる AST を導入する
3. 既存の専用型ノードを、新しい一般ノードへ段階的に吸収する
4. その後にテンプレート宣言と実体化へ進む
