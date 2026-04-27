# アーキテクチャ概要

## モジュール依存関係

```
parser → (なし)
runtime → (なし)
stdlib → (なし)
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

### 現状の到達点

- template AST と関数テンプレート単相化は入っている
- ただし `stdlib/` はまだ「完全な標準ライブラリ定義」ではなく、metadata と helper の集約層
- `vector` / `tuple` / `get` / `sort` などの振る舞い本体は、依然として `semantic/` と `interpreter/` の intrinsic 実装が担当している

## 新規組み込み追加手順

1. `stdlib/registry.ts` にメタデータ登録
2. `semantic/builtin-checker.ts` に型検査追加
3. `interpreter/builtin-eval.ts` に評価追加
4. `tests/` にテスト追加
5. `SPECIFICATION.md` 更新
