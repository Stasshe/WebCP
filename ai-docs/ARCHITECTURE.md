# アーキテクチャ概要

## モジュール依存関係

```
parser → (なし)
runtime → (なし)
stdlib → runtime, types
semantic → stdlib, types
interpreter → stdlib, runtime, parser, types
debugger → interpreter, runtime
index.ts → すべて
```

循環依存なし。各層は下位層のみ参照。

## semantic/

| ファイル | 責務 |
|---|---|
| `validator.ts` | AST 全体の型検査・エラー収集。メインエントリ |
| `builtin-checker.ts` | 組み込み関数・テンプレート呼び出し・メソッド呼び出しの型検査 |
| `template-instantiator.ts` | 関数テンプレートの型引数推論・単相化 |
| `type-compat.ts` | 型の互換性判定（`sameType`, `isAssignable`, `inferBinaryType` 等） |
| `type-utils.ts` | 型プレディケート純関数（`isIntType`, `containsVoid` 等） |

### 循環依存回避パターン

`builtin-checker.ts` は `validator.ts` の `inferExprType` / `validateExpr` を必要とするが、
`validator.ts` も `builtin-checker.ts` を呼ぶ。コールバック型で解決：

```typescript
export type ValidateExprFn = (expr: ExprNode | null, context: ValidationContext, expected?: TypeNode | "bool" | "int") => TypeNode | null;
export type InferExprTypeFn = (expr: ExprNode, context: ValidationContext) => TypeNode | null;
```

`validator.ts` 側でラムダを渡す：
```typescript
validateBuiltinCall(callee, args, line, col, context, validateExpr, inferExprType);
```

## interpreter/

| ファイル | 責務 |
|---|---|
| `evaluator.ts` | 式・文の評価メインロジック |
| `builtin-eval.ts` | 組み込み関数・テンプレート・メソッド呼び出しの評価 |
| `runtime/` | ランタイム支援（変数スコープ・型変換・デフォルト値等） |

### EvalCtx パターン

`builtin-eval.ts` は evaluator の内部メソッドを多数必要とする。
`EvalCtx` インターフェースで依存を逆転：

```typescript
export interface EvalCtx {
  evaluateExpr(expr: ExprNode): RuntimeValue;
  fail(message: string, line: number): never;
  expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }>;
  // ...
}
```

`evaluator.ts` が `evalCtx` getter で `this` をラップして渡す。

## stdlib/

| ファイル | 責務 |
|---|---|
| `registry.ts` | 組み込み関数・テンプレートのメタデータ登録・検索 |
| `template-exprs.ts` | テンプレート式ユーティリティ（`isTemplateNamed`, `getSingleTypeTemplateArg` 等） |
| `template-types.ts` | テンプレート型アクセサ（`vectorElementType`, `mapKeyType` 等） |
| `vector-methods.ts` / `map-methods.ts` | コンテナメソッド metadata |
| `builtins/compare.ts` | 値比較純関数（評価器文脈不要） |
| `eval-context.ts` | `EvalCtx` インターフェース定義（stdlib eval 関数が受け取る評価器コンテキスト） |
| `check-context.ts` | `CheckCtx` インターフェース定義（stdlib check 関数が受け取る型検査コンテキスト） |
| `eval/value-functions.ts` | abs / max / min / swap の評価実装 |
| `eval/factories.ts` | make_pair / make_tuple の評価実装 |
| `eval/vector.ts` | vector コンストラクタ・全メソッドの評価実装 |
| `eval/get.ts` | get<N> の評価実装 |
| `eval/pair-map.ts` | pair first/second・map.size の評価実装 |
| `eval/range-algorithms.ts` | sort / reverse / fill の評価実装 |
| `check/value-functions.ts` | abs / max / min / swap の型検査実装 |
| `check/factories.ts` | make_pair / make_tuple の型検査実装 |
| `check/vector.ts` | vector コンストラクタ・全メソッドの型検査実装 |
| `check/get.ts` | get<N> の型検査実装 |
| `check/methods.ts` | pair / map メソッドの型検査実装 |
| `check/range-algorithms.ts` | sort / reverse / fill の型検査実装 |

### stdlib の位置づけ（Phase 4 完了）

- `stdlib/eval/` が vector / sort / get<N> などの **振る舞い本体** を保持する
- `stdlib/check/` が同機能の **型検査本体** を保持する
- `semantic/builtin-checker.ts` と `interpreter/builtin-eval.ts` は **薄いディスパッチャ** に徹する
- コアへの intrinsic 直書きは解消済み

### EvalCtx パターン（stdlib 版）

`stdlib/eval/` の各関数は `EvalCtx` を受け取る。`EvalCtx` は `stdlib/eval-context.ts` で定義され、`evaluator.ts` の `evalCtx` getter がこれを実装して渡す。

同様に `stdlib/check/` の各関数は `CheckCtx`（`stdlib/check-context.ts`）を受け取り、`builtin-checker.ts` の `makeCheckCtx()` が ValidationContext を閉じ込めて渡す。

## 新規組み込み追加手順

1. `stdlib/registry.ts` にメタデータ登録
2. `stdlib/check/<category>.ts` に型検査実装追加
3. `stdlib/eval/<category>.ts` に評価実装追加
4. `semantic/builtin-checker.ts` のディスパッチに追加
5. `interpreter/builtin-eval.ts` のディスパッチに追加
6. `tests/` にテスト追加
7. `SPECIFICATION.md` 更新
