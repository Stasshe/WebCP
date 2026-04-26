# Competitive Programming 向け C サブセット仕様
## TypeScript インタープリタ実装用

---

## 1. 目的

- ステップ実行・変数可視化を前提に、競プロで必要十分な言語機能に限定する
- 未定義動作・低レベルメモリ操作を排除し、デバッグ容易性を最大化する
- エラーメッセージは GCC/Clang の実際の出力に可能な限り準拠する

---

## 2. 非対応機能（明示的に排除）

以下は実装しない。パーサが検出した場合はコンパイルエラーとする。

| 機能 | 備考 |
|---|---|
| 動的メモリ（`malloc`, `new`, `free`, `delete`） | |
| 構造体・クラス（`struct`, `class`） | |
| テンプレート（`template<>`） | ユーザー定義テンプレート・汎用テンプレート機構は非対応。`vector<T>`、`pair<T,U>`、`tuple<T...>`、`make_pair`、`make_tuple`、`get<I>`、`greater<int>()` など一部の標準ライブラリ記法のみ組み込みとして特別対応 |
| 関数ポインタ | |
| 名前空間（`namespace`） | `using namespace std;` のみ特別扱いで許可 |
| プリプロセッサ | `#include <bits/stdc++.h>` と `#define` のみ対応 |
| C / C++ キャスト構文（`(int)x`, `static_cast<>` 等） | |
| 参照戻り値 | 参照変数・参照引数・range-for 束縛のみ対応 |

---

## 3. 型システム

### 3.1 プリミティブ型

| 型名 | 内部表現 | 備考 |
|---|---|---|
| `int` | JS `BigInt`（64bit符号付き） | `long long` と同一 |
| `long long` | JS `BigInt`（64bit符号付き） | `int` と同一として扱う |
| `bool` | JS `boolean` | `true` / `false` リテラル |
| `string` | JS `string` | cin/cout での入出力に使用 |

- `int` と `long long` は同一の内部型。明示的な型名の違いはコンパイル時に許容する
- `bool` と `int` の間の暗黙変換は行わない。`true` を `int` として使う場合は `(int)true` の代わりに `1` と書く（キャスト非対応のため）
- `string` に対して使える演算は `+`（連結）、`==`、`!=`、`<`、`<=`、`>`、`>=`（辞書順比較）のみ
- `string` は `s[i]` で 1 文字の `string` として読み書きできる

### 3.2 ポインタ型と参照型

```cpp
int x = 3;
int *p = &x;
int &r = x;
*p = 5;
r = 7;
```

- `T*` と `T&` をサポートする
- 対応するのは束縛、アドレス取得、参照外し、`==` / `!=` 比較、関数引数、range-for 参照束縛、ポインタ演算
- ポインタ演算として `p + n`、`n + p`、`p - n`、`p - q`、`++p`、`--p`、`p += n`、`p -= n` をサポートする
- `p - q` は同じ配列（または同じ文字列）内の要素を指す場合のみ有効で、結果は要素数差の `int`
- 現在の実装ではポインタ演算は配列要素/文字列要素へのポインタに限定される（スカラ変数へのポインタは `+0`/`-0` 以外を実行時エラー）
- 実装範囲の明確化：配列/文字列に対しては one-past（終端の 1 つ先）ポインタの生成自体は許可するが、逆参照や書き込みは範囲外アクセスとして実行時エラー
- 実装範囲の明確化：`p - q` は「同一配列」または「同一文字列」のときのみ定義し、異なるオブジェクト間の差分は実行時エラー
- `&expr` は lvalue に対してのみ使用可能
- `*ptr` は pointer に対してのみ使用可能。null ポインタ参照は実行時エラー
- `0` と `nullptr` は null pointer constant として扱う
- `T&` の変数は宣言時初期化が必須
- `vector<T&>` や `T& a[10]` のような「要素型が参照」のコンテナは非対応
- 関数の戻り値として pointer は許可、reference は非対応

### 3.3 配列型

#### 固定長配列

```cpp
int a[1000];          // ゼロ初期化
int b[10] = {1, 2};  // 部分初期化（残りはゼロ）
int c[2][3];         // 多次元固定長配列
```

- サイズは整数リテラルのみ（定数変数は将来対応）
- 宣言スコープに応じてローカル／グローバルどちらでも使用可能
- 多次元配列は `a[i][j]` のように通常の添字でアクセスできる
- 初期化子は平坦化した `{1, 2, 3, ...}` 形式のみ対応する

#### 動的配列（`vector`）

```cpp
vector<int> v;            // 空
vector<int> v(n);         // サイズ n、ゼロ初期化
vector<int> v(n, x);      // サイズ n、x で初期化
vector<string> vs;        // string の vector も可
vector<vector<int>> g;    // ネスト vector も可
```

対応メソッド：

| メソッド | 動作 |
|---|---|
| `v.push_back(x)` | 末尾追加 |
| `v.pop_back()` | 末尾削除 |
| `v.size()` | 要素数（`int` として返す） |
| `v.back()` | 末尾要素の参照 |
| `v.empty()` | 空かどうか（`bool`） |
| `v.clear()` | 全要素削除 |
| `v[i]` | 添字アクセス（範囲外は実行時エラー） |
| `v.resize(n)` | リサイズ（縮小時は切り捨て、拡大時はゼロ埋め） |

### 3.4 配列・vector の関数渡し

- 構文上は値渡しとして記述する
- 内部実装は参照渡し（JS 配列の参照セマンティクスをそのまま利用）
- つまり関数内で配列を変更すると呼び出し元に反映される（C++ の配列引数と同じ挙動）
- これは仕様上の意図的な設計であり、ドキュメントで明示する

```cpp
void fill(vector<int> v, int x) {
    for (int i = 0; i < v.size(); i++) v[i] = x;
    // 呼び出し元の v も変更される
}
```

### 3.5 `auto`

```cpp
for (auto& x : v) { ... }
```

- 現在は range-based for の束縛変数でのみ `auto` をサポートする
- `auto` は要素の値コピー、`auto&` は各要素への参照束縛になる
- 一般の変数宣言（`auto x = ...;`）や関数戻り値推論は非対応

### 3.6 `pair`

```cpp
pair<int, int> p = make_pair(1, 2);
cout << p.first << " " << p.second << "\n";
```

- `pair<T, U>` を型としてサポートする
- 生成は `make_pair(a, b)` をサポートする
- メンバーアクセスとして `p.first` と `p.second` をサポートする
- これは一般テンプレートの実装ではなく、`pair` を組み込み ADT として特別扱いする
- 構造化束縛（`auto [x, y]`）は非対応

### 3.7 `tuple` / 多重戻り値

```cpp
tuple<int, string, int> solve(int x) {
    return make_tuple(x + 1, "ok", x * 2);
}

int main() {
    tuple<int, string, int> t = solve(3);
    cout << get<0>(t) << " " << get<1>(t) << " " << get<2>(t) << "\n";
}
```

- `tuple<T1, T2, ...>` を型としてサポートする
- 生成は `make_tuple(a, b, ...)` をサポートする
- 要素アクセスは `get<I>(t)` をサポートする。`I` は 0 始まりの非負整数リテラル
- `get<I>(t)` は lvalue として使える。代入や `swap` の対象にもできる
- 関数の戻り値として `tuple<...>` を許可し、多重戻り値は tuple を返す形で表現する
- これは一般テンプレートの実装ではなく、`tuple` と `get<I>` を組み込み ADT / 組み込み操作として特別扱いする
- 構造化束縛（`auto [x, y]`）は非対応

---

## 4. 変数

### 4.1 宣言と初期化

```cpp
int a;          // 未初期化（読み取り時に実行時エラー）
int a = 0;
int a = b + 1;
bool flag = true;
string s = "hello";
int x = 1, y = 2;
int a[2] = {1, 2}, b = 3;
int *p = &x;
int &r = y;
```

### 4.2 グローバル変数

関数定義の外側に変数・配列を宣言できる。

```cpp
int dp[1001];
int n, m;

int main() {
    cin >> n >> m;
    ...
}
```

- グローバル変数はプログラム開始時にゼロ初期化される（プリミティブは `0` / `false` / `""`、配列は全要素ゼロ）
- グローバルスコープでは宣言と初期化のみ許可。関数呼び出し・制御構文は不可

### 4.3 スコープ規則

- ブロック（`{}`）ごとにスコープが生成される
- 内側のブロックから外側のスコープの変数を読み書きできる
- 同名変数はシャドウイングを許可する（内側の宣言が優先）
- ブロック終了時に内側の変数は破棄される

---

## 5. 演算子

### 5.1 算術演算子

| 演算子 | 動作 | 備考 |
|---|---|---|
| `+` | 加算 / 文字列連結 | |
| `-` | 減算 | 単項マイナスも可（`-x`） |
| `*` | 乗算 | |
| `/` | 除算 | 整数除算（切り捨て）。ゼロ除算は実行時エラー |
| `%` | 剰余 | ゼロ除算は実行時エラー |
| `<<` | 左シフト | シフト数が負なら実行時エラー |
| `>>` | 右シフト | シフト数が負なら実行時エラー |
| `&` | bit AND | `int` 同士のみ |
| `^` | bit XOR | `int` 同士のみ |
| `\|` | bit OR | `int` 同士のみ |
| `~` | bit NOT | 単項演算子 |

### 5.2 比較演算子

`==`、`!=`、`<`、`<=`、`>`、`>=`

- `int`、`bool`、`string` に対して使用可能
- 結果は `bool`

### 5.3 論理演算子

| 演算子 | 動作 |
|---|---|
| `&&` | 論理AND（短絡評価） |
| `\|\|` | 論理OR（短絡評価） |
| `!` | 論理NOT |

### 5.4 代入演算子

`=`、`+=`、`-=`、`*=`、`/=`、`%=`

### 5.5 インクリメント・デクリメント

| 演算子 | 形式 | 動作 |
|---|---|---|
| `i++` | 後置 | 評価後にインクリメント |
| `++i` | 前置 | インクリメント後に評価 |
| `i--` | 後置 | 評価後にデクリメント |
| `--i` | 前置 | デクリメント後に評価 |

- `int` 型変数に使用可能
- pointer に対する `++` / `--` もサポートする（配列要素/文字列要素を指すポインタに限定）

### 5.6 三項演算子

```cpp
int x = cond ? a : b;
```

- `cond ? expr1 : expr2` をサポートする
- 条件式は `if` / `while` と同様に `bool` または数値型を取れる
- `cond` は短絡評価され、選ばれた側の式だけを実行する
- 結果型は両分岐の共通型になる。少なくとも同一型、数値同士、`pointer` と `0`、`pair` 同士をサポートする

### 5.7 演算子の優先順位

C++ の標準的な優先順位に準拠する。高い順に：

```
1. 後置: i++, i--, v[i], f()
2. 前置: ++i, --i, !, ~, -(単項), *ptr, &var
3. 乗除: * / %
4. 加減: + -
5. シフト: << >>
6. 比較: < <= > >=
7. 等値: == !=
8. bit AND: &
9. bit XOR: ^
10. bit OR: |
11. 論理AND: &&
12. 論理OR: ||
13. 代入: = += -= *= /= %=
```

---

## 6. 制御構文

### 6.1 `if` / `else if` / `else`

```cpp
if (expr) block
if (expr) block else block
if (expr) block else if (expr) block else block
```

### 6.2 `for`

```cpp
for (init; cond; update) block
```

- `init`：変数宣言（`int i = 0`）またはassign式（`i = 0`）または空
- `cond`：任意の式。省略時は `true` として扱う
- `update`：代入式またはインクリメント/デクリメント式（`i++`、`i += 2` 等）。セミコロンは不要

```cpp
for (int i = 0; i < n; i++) { ... }
for (int i = n - 1; i >= 0; i--) { ... }
for (;;) { ... }   // 無限ループ
```

### 6.3 range-based `for`

```cpp
for (auto x : v) { ... }
for (auto& x : v) { ... }
for (int x : a) { ... }
```

- 走査対象は固定長配列・`vector`・`string`
- `auto&` や `T&` を使うと、ループ変数への代入が元要素に反映される
- `string` を走査する場合、要素は長さ 1 の `string`

### 6.4 `while`

```cpp
while (expr) block
```

### 6.5 `break` / `continue`

- `for`、`while` ループ内でのみ使用可能
- ループ外での使用はコンパイルエラー

### 6.6 `return`

```cpp
return;           // void 関数
return expr;      // 非 void 関数
```

- `void` 関数で `return expr;` はコンパイルエラー
- 非 `void` 関数の末尾到達時は型ごとのデフォルト値を返す（`int` は `0`、pointer は null など）

---

## 7. 関数

### 7.1 定義

```cpp
return_type name(param_list) block
```

- `return_type`：`int`、`long long`、`bool`、`string`、`void`、`vector<T>`、`pair<T,U>`、`tuple<T...>`、`T*`
- `param_list`：カンマ区切りの `type name` のリスト（空も可）
- 引数は値渡し（配列・vector を除く。§3.4 参照）
- 参照引数（`T&`）をサポートする。呼び出し側は lvalue を渡す必要がある
- 関数のオーバーロードは非対応

```cpp
void dfs(int v, int parent) { ... }
int gcd(int a, int b) { ... }
bool isPrime(int n) { ... }
void chmax(int& a, int b) { if (a < b) a = b; }
int *pick(int *p) { return p; }
```

### 7.2 呼び出し

```cpp
dfs(0, -1);
int g = gcd(a, b);
```

### 7.3 再帰

許可。スタック深さの上限は実装依存（デフォルト 10,000 フレームを推奨）。超過時は実行時エラー。

### 7.4 エントリーポイント

- `int main()` が必須
- `main` は引数なしのみ対応
- `main` の戻り値は無視してよい
- `argc`、`argv` は非対応

```cpp
int main() {
    ...
    return 0;
}
```

---

## 8. 入出力

### 8.1 `cin`

```cpp
cin >> a;
cin >> n >> m;
cin >> s;          // string（空白区切りで1トークン）
```

- `int`、`long long`、`bool`、`string` 型変数への入力に対応
- 配列要素・vector 要素・`string` 添字への直接入力も可：`cin >> a[i]`, `cin >> v[i]`, `cin >> s[i]`
- `using namespace std;` は書いてもよい。意味的には無視される
- `cin` / `cout` / `cerr` / `endl` は `using namespace std;` がなくても直接使える
- `ios::sync_with_stdio(false);`、`ios_base::sync_with_stdio(false);`、`cin.tie(nullptr);` は競プロ互換の no-op として受理する

### 8.2 `cout`

```cpp
cout << x;
cout << "ans: " << x << "\n";
cout << endl;     // "\n" と同等（フラッシュは内部的に無視）
```

- `int`、`long long`、`bool`（`0`/`1` で出力）、`string` の出力に対応
- `"\n"` と `endl` は同等として扱う

### 8.3 `cerr`

```cpp
cerr << "debug: " << x << "\n";
```

- 標準エラーに出力。デバッグ用途として許可
- インタープリタの UI 上では stderr 出力として区別して表示する

---

## 9. 組み込み関数

以下を標準ライブラリ相当として提供する。

| 関数 | シグネチャ（擬似的） | 動作 |
|---|---|---|
| `abs(x)` | `int abs(int x)` | 絶対値 |
| `max(a, b)` | `int max(int a, int b)` | 大きい方 |
| `min(a, b)` | `int min(int a, int b)` | 小さい方 |
| `swap(a, b)` | `void swap(T& a, T& b)` | 値の交換（参照渡しとして特別扱い） |
| `sort(v.begin(), v.end())` | vector のソート | 昇順 |
| `sort(v.begin(), v.end(), greater<int>())` | vector のソート | 降順 |
| `reverse(v.begin(), v.end())` | vector の反転 | |
| `fill(v.begin(), v.end(), x)` | vector の一括初期化 | |

- 組み込み関数名は予約語ではない。ユーザー定義関数が同名ならユーザー定義を優先する
- `swap` の引数は lvalue（変数または添字アクセス）でなければならない
- `sort` / `reverse` / `fill` は `vector` に対する完全範囲 `v.begin(), v.end()` のみ対応
- `sort` の comparator は `greater<int>()` 形式のみ対応
- `sort` 等の `begin()` / `end()` はイテレータの模倣として構文解析レベルで特別扱いする
- 固定長配列への `sort`（`sort(a, a + n)`）は将来対応

---

## 10. エラー仕様

### 10.1 コンパイルエラー

パース・型チェック段階で検出。GCC のエラーメッセージ形式に準拠：

```
<filename>:<line>:<col>: error: <message>
```

| 種別 | メッセージ例 |
|---|---|
| 未宣言識別子 | `error: 'x' was not declared in this scope` |
| 型の不一致 | `error: cannot convert 'int' to 'bool'` |
| reference 初期化漏れ | `error: reference variable must be initialized` |
| reference への非 lvalue 束縛 | `error: reference argument must be an lvalue` |
| 引数数の不一致 | `error: too few arguments to function 'f'` |
| 引数数過多 | `error: too many arguments to function 'f'` |
| void 関数からの値返却 | `error: return-statement with a value, in function returning 'void'` |
| 非 void 関数で値なし return | `error: return-statement with no value, in function returning non-void` |
| ループ外の `break`/`continue` | `error: break statement not within loop` |
| 不正な `main` シグネチャ | `error: 'main' must return 'int'` |
| `swap` の非 lvalue 引数 | `error: swap arguments must be lvalues` |
| 非対応構文の使用 | `error: this feature is not supported in this interpreter` |

### 10.2 実行時エラー

実行中に検出。スタックトレースを出力する。

```
Runtime Error: <message>
  at <function>:<line>
  at <function>:<line>
  ...
```

| 種別 | メッセージ |
|---|---|
| ゼロ除算 | `Runtime Error: division by zero` |
| 配列範囲外アクセス | `Runtime Error: index 10 out of range for array of size 5` |
| null ポインタ参照 | `Runtime Error: dereference of null pointer` |
| 未初期化変数の読み取り | `Runtime Error: use of uninitialized variable 'x'` |
| スタックオーバーフロー | `Runtime Error: stack overflow (recursion depth exceeded 10000)` |
| ステップ上限超過（無限ループ） | `Runtime Error: execution step limit exceeded (possible infinite loop)` |

### 10.3 警告

エラーではないが UI 上に表示する。

| 種別 | メッセージ例 |
|---|---|
| 現状なし | 実装は非 `void` 関数の末尾到達を警告ではなくデフォルト値返却として扱う |

---

## 11. 実行モデル

### 11.1 コールスタック

```typescript
type Value =
  | { kind: "int";    value: bigint }
  | { kind: "bool";   value: boolean }
  | { kind: "string"; value: string }
  | { kind: "pointer"; pointeeType: TypeNode; target: RuntimeLocation | null }
  | { kind: "reference"; type: ReferenceTypeNode; target: RuntimeLocation }
  | { kind: "array";  ref: ArrayId }
  | { kind: "uninitialized" }

type Scope = Map<string, Value>  // 変数名 -> 値

type Frame = {
  functionName: string
  scopeStack:   Scope[]          // ブロックごとにpush/pop
  returnValue:  Value | null
  currentNode:  ASTNode
  line:         number
}

type CallStack = Frame[]
```

### 11.2 グローバルストレージ

```typescript
type GlobalStore = {
  vars:   Map<string, Value>
  arrays: Map<ArrayId, Value[]>  // 配列・vectorの実体はここで管理
}
```

- 配列・vector の実体は `GlobalStore.arrays` に格納し、変数は `ArrayId`（内部ID）を保持する
- 関数に配列を渡す際は `ArrayId` をそのまま渡すため、参照セマンティクスが実現される
- pointer / reference は `RuntimeLocation` を保持し、デバッガからも追跡できるようにする

### 11.3 変数解決順序

1. 現フレームの `scopeStack` の末尾（最も内側のスコープ）から順に探索
2. フレーム内に見つからなければ `GlobalStore.vars` を参照
3. それでも見つからなければ実行時エラー

### 11.4 無限ループ検出

- 実行ステップ数の上限を設ける（デフォルト：10,000,000 ステップ）
- 上限超過時は `Runtime Error: execution step limit exceeded` を発生させる
- UI 側でステップ上限を設定可能にする

### 11.5 状態のシリアライズ

すべての実行状態（コールスタック・グローバルストレージ・現在行）はシリアライズ可能でなければならない。これは UI との連携（ステップ実行の UI 更新・巻き戻し）のための要件。

```typescript
type InterpreterState = {
  callStack:   Frame[]
  globalStore: GlobalStore
  output:      string     // stdout の現在の内容
  errorOutput: string     // stderr の現在の内容
  status:      "running" | "paused" | "done" | "error"
  error:       RuntimeError | null
}
```

---

## 12. デバッグ機能

### 12.1 ステップ実行 API

| メソッド | 動作 |
|---|---|
| `stepInto()` | 次の AST ノードへ進む。関数呼び出しがあれば内部に入る |
| `stepOver()` | 次の文へ進む。関数呼び出しは1ステップで実行する |
| `stepOut()` | 現在の関数を末尾まで実行し、呼び出し元に戻る |
| `run()` | 次のブレークポイントまたは終了まで実行する |
| `pause()` | 実行を一時停止する |

### 12.2 ブレークポイント

- 行番号単位で設定・解除可能
- 条件付きブレークポイント（将来対応）

### 12.3 可視化情報

各ステップ停止時に以下を提供する：

```typescript
type DebugInfo = {
  currentLine:   number
  callStack:     FrameView[]      // 各フレームの関数名・行番号
  localVars:     ScopeView[]      // 現フレームのスコープ階層
  globalVars:    VarView[]        // グローバル変数一覧
  arrays:        ArrayView[]      // 配列・vectorの中身（全要素）
  watchList:     WatchView[]      // ユーザが指定した式の現在値
}
```

---

## 13. 文法（完全 EBNF）

```ebnf
program       = { global_decl } { function } ;

(* グローバル宣言 *)
global_decl   = var_decl | array_decl | vector_decl ;

(* 関数 *)
function      = type declarator "(" param_list ")" block ;
param_list    = [ param { "," param } ] ;
param         = type declarator ;

(* 型 *)
type          = "int" | "long long" | "bool" | "string" | "void"
              | "vector" "<" type ">" ;
declarator    = { "*" } [ "&" ] ident { "[" [ int_lit ] "]" } ;

(* 文 *)
block         = "{" { statement } "}" ;
stmt_or_block = block | statement ;
statement     = var_decl
              | array_decl
              | vector_decl
              | io_stmt
              | if_stmt
              | for_stmt
              | range_for_stmt
              | while_stmt
              | return_stmt
              | break_stmt
              | continue_stmt
              | expr_stmt ;

var_decl      = type var_item { "," var_item } ";" ;
var_item      = ident [ "=" expr ] ;
array_decl    = type array_item { "," array_item } ";" ;
array_item    = ident "[" int_lit "]" [ "=" "{" [ expr_list ] "}" ] ;
vector_decl   = "vector" "<" type ">" vector_item { "," vector_item } ";" ;
vector_item   = ident [ "(" [ expr [ "," expr ] ] ")" ] ;

if_stmt       = "if" "(" expr ")" stmt_or_block
                { "else" "if" "(" expr ")" stmt_or_block }
                [ "else" stmt_or_block ] ;

for_stmt      = "for" "(" for_init expr ";" for_update ")" stmt_or_block ;
range_for_stmt = "for" "(" range_binding ":" expr ")" stmt_or_block ;
range_binding = ( type | "auto" ) [ "&" ] ident ;
for_init      = var_decl | assign_expr ";" | ";" ;
for_update    = assign_expr | postfix_expr | ε ;

while_stmt    = "while" "(" expr ")" stmt_or_block ;
return_stmt   = "return" [ expr ] ";" ;
break_stmt    = "break" ";" ;
continue_stmt = "continue" ";" ;
expr_stmt     = expr ";" ;

(* 入出力 *)
io_stmt       = cin_stmt | cout_stmt | cerr_stmt ;
cin_stmt      = "cin" { ">>" lvalue } ";" ;
cout_stmt     = "cout" { "<<" expr } ";" ;
cerr_stmt     = "cerr" { "<<" expr } ";" ;

(* 式（優先順位は §5.6 に従う） *)
expr          = assign_expr ;
assign_expr   = lvalue assign_op expr
              | logical_or ;
assign_op     = "=" | "+=" | "-=" | "*=" | "/=" | "%=" ;
logical_or    = logical_and { "||" logical_and } ;
logical_and   = bitwise_or { "&&" bitwise_or } ;
bitwise_or    = bitwise_xor { "|" bitwise_xor } ;
bitwise_xor   = bitwise_and { "^" bitwise_and } ;
bitwise_and   = equality { "&" equality } ;
equality      = relational { ( "==" | "!=" ) relational } ;
relational    = shift { ( "<" | "<=" | ">" | ">=" ) shift } ;
shift         = additive { ( "<<" | ">>" ) additive } ;
additive      = multiplicative { ( "+" | "-" ) multiplicative } ;
multiplicative = unary { ( "*" | "/" | "%" ) unary } ;
unary         = ( "!" | "-" | "~" | "++" | "--" | "*" | "&" ) unary
              | postfix_expr ;
postfix_expr  = primary { postfix_op } ;
postfix_op    = "++" | "--"
              | "[" expr "]"
              | "(" arg_list ")"
              | "." method_call ;
primary       = int_lit | bool_lit | string_lit | ident | "(" expr ")" ;

lvalue        = ident | ident "[" expr "]" | "*" unary ;
arg_list      = [ expr { "," expr } ] ;
expr_list     = expr { "," expr } ;
method_call   = ident "(" arg_list ")" | ident ;

(* リテラル *)
int_lit       = ["-"] digit { digit } ;
bool_lit      = "true" | "false" ;
string_lit    = '"' { char } '"' ;
ident         = letter { letter | digit | "_" } ;
```

---

## 14. AST ノード定義

```typescript
type ASTNode =
  | Program
  | FunctionDecl
  | BlockStmt
  | GlobalVarDecl
  | VarDecl
  | ArrayDecl
  | VectorDecl
  | AssignExpr
  | BinaryExpr
  | UnaryExpr
  | PostfixExpr          // i++, i--
  | IndexExpr            // a[i]
  | CallExpr
  | MethodCallExpr       // v.push_back(x) 等
  | IfStmt
  | ForStmt
  | WhileStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | CinStmt
  | CoutStmt
  | CerrStmt
  | Literal              // int, bool, string リテラル
  | Identifier

// 各ノードは line, col を保持する
type NodeBase = { line: number; col: number }
```

---

## 15. 実装優先順位

| フェーズ | 内容 |
|---|---|
| 1 | 式評価（四則・比較・論理）、リテラル、`int` 型 |
| 2 | 変数宣言・代入・ブロックスコープ |
| 3 | `if` / `while` |
| 4 | `for`（`int i = 0; i < n; i++` を含む） |
| 5 | 関数定義・呼び出し・再帰 |
| 6 | `cin` / `cout` |
| 7 | 固定長配列 |
| 8 | `vector` と組み込みメソッド |
| 9 | グローバル変数 |
| 10 | デバッグ API（stepInto / stepOver / stepOut / breakpoint） |
| 11 | `bool`、`string` 型の完全対応 |
| 12 | `sort`、`abs`、`max`、`min` 等の組み込み関数 |
| 13 | `long long` の明示的な型名対応 |
| 14 | `cerr`、`endl` |

### 将来対応

- 三項演算子（`? :`）
- 条件付きコンパイル（`#if`, `#ifdef`, `#ifndef`, `#else`, `#endif`）
- その他のプリプロセッサディレクティブ
- 条件付きブレークポイント
- 実行の巻き戻し（リバースデバッグ）
- 固定長配列への `sort(a, a + n)`

---

## 16. 設計上の原則

1. **エラーは例外ではなく結果として返す**：インタープリタは例外をスローせず、`InterpreterState` の `status: "error"` と `error` フィールドで伝達する
2. **すべての状態はシリアライズ可能**：UI 連携のため `InterpreterState` は JSON にシリアライズできなければならない
3. **エラーメッセージは GCC/Clang に準拠**：初心者が本物のコンパイラに移行したときに混乱しないようにする
4. **配列の参照セマンティクスは仕様として明示**：C++ の実挙動と一致するため、バグではなく仕様として文書化する
5. **ステップ単位は AST ノード 1 つ**：式の途中状態も可視化できるようにするため
