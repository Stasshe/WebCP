# Template/Stdlib Audit (2026-04-28)

## Summary

- `template-impl` は `main` より明確に前進している
- ただし「phase 4 完了」ではない
- 実装実態は phase 2-3 の一部完了 + phase 4 の土台整備、という整理が妥当

## Phase Status

### Phase 1: Name And Library Isolation

- ほぼ達成
- `src/stdlib/registry.ts`
- `src/stdlib/template-exprs.ts`
- `src/stdlib/template-types.ts`
- `src/stdlib/vector-methods.ts`
- `src/stdlib/map-methods.ts`

名前や metadata の散在はかなり減っている。

### Phase 2: Generic Template AST

- 部分達成
- `TemplateInstanceType`
- `TemplateIdExpr`
- `TemplateCallExpr`
- `TemplateFunctionDecl`

ただし一般の `foo<int>` を広く受理する段階には達していない。現状の `TemplateIdExpr` は主に `vector` / `map` / `pair` / `tuple` / `get` / `greater` 向けで、ユーザー定義関数テンプレートの明示型引数呼び出し `f<int>(x)` は未対応。

### Phase 3: Symbol Table And Instantiation

- 部分達成
- 関数テンプレートの保持、型推論、実体化、再帰防止は入っている
- 今回、競合する型推論を誤って受理していた点を修正した

未対応:

- クラステンプレート
- 明示特殊化
- 部分特殊化
- オーバーロード解決
- 明示テンプレート実引数呼び出し

### Phase 4: Stdlib As Definitions

- 未達成

`stdlib/` は「標準ライブラリ定義本体」ではなく、まだ metadata / helper 集約層である。以下は依然として core intrinsic 実装:

- `vector` constructor
- `make_pair`
- `make_tuple`
- `get<I>`
- `greater<int>()`
- `sort` / `reverse` / `fill`
- `pair.first` / `pair.second`
- `map.size()`

つまり「特別扱いがコアに残っていないか」という観点では、まだ残っている。方向性は改善しているが、phase 4 完了とは言えない。

## Diff Review (`main...template-impl`)

- AST を `VectorCtorExpr` / `TupleGetExpr` の専用ノードから一般化方向へ寄せた点は妥当
- `validator.ts` / `evaluator.ts` の肥大化を `builtin-checker.ts` / `builtin-eval.ts` / `type-compat.ts` に分離したのは妥当
- 一方で「一般化した外形」の下に intrinsic 分岐がまだ多数残るため、見た目ほど stdlib 定義化は進んでいない

総評として、`main` に対する差分は merge 価値があるが、PR 説明では「phase 4 完了」ではなく、以下の表現に留めるのが正確:

- template/function-template groundwork
- AST generalization for template-shaped syntax
- stdlib metadata extraction
- partial function-template instantiation

## Known Gaps Worth Tracking

### 1. Unused template definitions are not fully validated at definition time

非依存な名前解決エラーでも、未実体化なら通るケースがある。完全な二段階名前探索をやる話になるため、軽修正では済まない。

### 2. ~~Stdlib behavior still lives in semantic/interpreter branches~~ (解消済み 2026-04-28)

`stdlib/eval/` と `stdlib/check/` に vector / sort / get<N> / make_pair 等の振る舞い本体を移動した。
`semantic/builtin-checker.ts` と `interpreter/builtin-eval.ts` は薄いディスパッチャに変更。
`EvalCtx` / `CheckCtx` インターフェースで循環依存を回避。

### 3. Explicit template arguments are still unsupported

`f<int>(x)` が通らない。現状のサポート境界は「宣言は template、呼び出しは型推論のみ」。

## Non-template Existing Issues From `main`

- 今回の監査では、`main` から継続している重大な non-template 問題で、即修正すべきものは新たに確認していない
- 重い未解決論点は上記 template/stdlib 監査の範囲内に収まっている
