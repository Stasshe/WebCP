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
| テンプレート（`template<>`） | 関数テンプレート宣言、実引数からの型推論による呼び出し、明示テンプレート実引数呼び出し（`f<int>(x)`）を限定対応する。`vector<T>`、`map<K,V>`、`pair<T,U>`、`tuple<T...>`、`make_pair`、`make_tuple`、`get<I>`、`greater<int>()` / `greater<>()` などの標準ライブラリ風記法をサポートする。クラステンプレート・変数テンプレート・部分特殊化・明示特殊化・完全なオーバーロード解決は非対応 |
| 関数ポインタ | |
| 名前空間（`namespace`） | `using namespace std;` のみ特別扱いで許可 |
| プリプロセッサ | `#include <bits/stdc++.h>`、`#include <iostream>`、`#include <vector>`、`#include <map>`、`#define` に対応 |
| C / C++ キャスト構文（`(int)x`, `static_cast<>` 等） | |
| 参照戻り値 | 参照変数・参照引数・range-for 束縛のみ対応 |

---

## 3. 型システム

### 3.1 プリミティブ型

| 型名 | 内部表現 | 備考 |
|---|---|---|
| `int` | JS `BigInt` | `long long` と同一 |
| `long long` | JS `BigInt` | `int` と同一として扱う |
| `double` | JS `number` | 浮動小数点 |
| `bool` | JS `boolean` | `true` / `false` リテラル |
| `char` | JS `string` | 長さ 1 の Unicode 文字 |
| `string` | JS `string` | cin/cout での入出力に使用 |

- `int` と `long long` は同一の内部型として扱う。オーバーフロー検査や 64bit 範囲制約は行わない
- `char` は長さ 1 の文字として保持するが、数値演算・比較では整数型としても扱える
- `int` / `long long` と `double` の間では数値演算・代入・引数受け渡し・三項演算子の共通型解決で暗黙変換を許可する
- `char` と `int` / `long long` / `double` の間では数値演算・代入・引数受け渡し・三項演算子の共通型解決で暗黙変換を許可する
- `char` と `string` の間では、`string` 側が長さ 1 のときのみ代入・引数受け渡しが実行時に成功する。長さ 1 以外は実行時エラー
- `double` から `int` / `long long` への変換は、値が有限かつ整数値のときのみ実行時に成功する。非整数や `NaN` / `Infinity` は実行時エラー
- `double` から `char` への変換は、値が有限かつ整数値で、有効な Unicode code point の範囲内にあるときのみ実行時に成功する
- `bool` と数値型の間の一般的な暗黙変換は行わない。ただし `if` / `while` / `for` / 三項演算子の条件式では `bool`、`int`、`long long`、`double` を受理する
- `string` に対して使える演算は `+`（連結）、`==`、`!=`、`<`、`<=`、`>`、`>=`（辞書順比較）のみ
- `string` は `s[i]` で `char` として読み書きできる
- `char` リテラルは `'a'`、`'\n'`、`'\\'` のように表記する。複数文字を含む文字リテラルはコンパイルエラー

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
| `v.begin()` | `v` 全体を指す range 始端。現状は `sort` / `reverse` / `fill` の完全範囲指定専用 |
| `v.end()` | `v` 全体を指す range 終端。現状は `sort` / `reverse` / `fill` の完全範囲指定専用 |
| `v[i]` | 添字アクセス（範囲外は実行時エラー） |
| `v.resize(n)` | リサイズ（縮小時は切り捨て、拡大時は型ごとの既定値で埋める） |

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
- `p.first` / `p.second` は member access として扱い、lvalue 代入にも使える
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
- `get<I>(t)` は template-call として扱い、stdlib registry 経由で解決する
- 構造化束縛（`auto [x, y]`）は非対応

### 3.8 関数テンプレート（限定対応）

```cpp
template<typename T>
void chmin(T& a, T b) {
    if (b < a) a = b;
}
```

- トップレベルの関数テンプレート宣言をサポートする
- 型パラメータ宣言は `template<typename T, ...>` のみ対応する。`class` は未対応
- 呼び出しは `chmin(x, y)` のような型推論付き呼び出しと `chmin<int>(x, y)` のような明示テンプレート実引数呼び出しに対応する
- 同一テンプレート引数は厳密に一致する必要があり、`same('a', 1)` のような競合推論はコンパイルエラー
- 単相化（monomorphization）は呼び出しごとに実施する。型引数置換（`substituteExpr`）は式・文の全ノードに再帰適用する（変数宣言初期化子、配列初期化子、if/for/while/range-for の条件・更新・ソース式を含む）
- サポート対象は関数テンプレートのみ
- 未対応: クラステンプレート、部分特殊化、明示特殊化、オーバーロード解決

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

- 数値演算は `int` / `long long` 同士、`double` 同士、または両者の混在を受理する
- `/` は `double` を含む場合は浮動小数除算、整数同士の場合は `BigInt` による整数除算
- `%` は現在の実装では `double` に対しても JS `%` 相当で動作する
- bit 演算・シフト演算は `int` / `long long` のみ対応

### 5.2 比較演算子

`==`、`!=`、`<`、`<=`、`>`、`>=`

- `int` / `long long` / `double` / `bool` / `string` / pointer に対して使用可能
- 結果は `bool`
- `pair` と `tuple` の比較は未対応で、コンパイルエラー

### 5.3 論理演算子

| 演算子 | 動作 |
|---|---|
| `&&` | 論理AND（短絡評価） |
| `\|\|` | 論理OR（短絡評価） |
| `!` | 論理NOT |

- `&&` / `||` / `!` のオペランドは `bool` のみ対応

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
- 条件式は `if` / `while` と同様に `bool`、`int`、`long long`、`double` を取れる
- `cond` は短絡評価され、選ばれた側の式だけを実行する
- 結果型は両分岐の共通型になる。少なくとも同一型、数値同士、`pointer` と `0`、`pair` 同士、`tuple` 同士をサポートする

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
13. 三項: ?:
14. 代入: = += -= *= /= %=
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

- `init`：変数宣言、複数宣言、代入式、または空
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
for (auto& p : m) { ... }  // map: p は pair<K, V>
```

- 走査対象は固定長配列・`vector`・`map`・`string`
- `auto&` や `T&` を使うと、ループ変数への代入が元要素に反映される
- `map` を走査する場合、要素は `pair<K, V>`
- `string` を走査する場合、要素は `char`

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
- 非 `void` 関数の末尾到達時は型ごとの既定値を返す（`int` は `0`、`double` は `0.0`、pointer は null、`pair` / `tuple` は要素ごとの既定値など）

---

## 7. 関数

### 7.1 定義

```cpp
return_type name(param_list) block
```

- `return_type`：`int`、`long long`、`double`、`bool`、`string`、`void`、`vector<T>`、`pair<T,U>`、`tuple<T...>`、`T*`
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

許可。明示的な再帰深さ制限は現在の実装には入っておらず、深すぎる再帰はホスト環境依存の失敗になりうる。

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
- `double` 型変数への入力にも対応
- `bool` 入力は `0` / `1` のみ対応
- 配列要素・vector 要素・`string` 添字への直接入力も可：`cin >> a[i]`, `cin >> v[i]`, `cin >> s[i]`
- `using namespace std;` は書いてもよい。意味的には無視される
- `cin` / `cout` / `cerr` / `endl` は `using namespace std;` がなくても直接使える
- `ios::sync_with_stdio(false);`、`ios_base::sync_with_stdio(false);`、`cin.tie(nullptr);`、`cout.tie(nullptr);`、`cerr.tie(nullptr);` は競プロ互換の no-op として受理する

### 8.2 `cout`

```cpp
cout << x;
cout << "ans: " << x << "\n";
cout << endl;     // "\n" と同等（フラッシュは内部的に無視）
```

- `int`、`long long`、`double`、`bool`（`0`/`1` で出力）、`string`、`pair`、`tuple`、pointer の出力に対応
- `pair` / `tuple` は `(a, b, ...)` 形式で出力する
- `"\n"` と `endl` は同等として扱う。`endl` は組み込み識別子として `"\n"` 相当の文字列に評価され、flush は行わない

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
| `make_pair(a, b)` | `pair<T, U> make_pair(T a, U b)` | `pair` の生成 |
| `make_tuple(a, b, ...)` | `tuple<T...> make_tuple(T...)` | `tuple` の生成 |
| `sort(v.begin(), v.end())` | vector のソート | 昇順 |
| `sort(v.begin(), v.end(), greater<int>())` | vector のソート | 降順 |
| `reverse(v.begin(), v.end())` | vector の反転 | |
| `fill(v.begin(), v.end(), x)` | vector の一括初期化 | |

- 組み込み関数名は予約語ではない。ユーザー定義関数が同名ならユーザー定義を優先する
- `abs` / `max` / `min` は現在の実装では整数専用
- `swap` の引数は lvalue（変数または添字アクセス）でなければならない
- `make_pair` はちょうど 2 引数、`make_tuple` は 1 引数以上を要求する
- `sort` / `reverse` / `fill` は `vector` に対する完全範囲 `v.begin(), v.end()` のみ対応し、`begin()` / `end()` が返す内部 iterator を通じて range を扱う
- `sort` の comparator は `greater<int>()` と `greater<>()` に対応する。後者は前処理段階で `greater<int>()` に正規化する
- `greater<int>()` / `greater<>()` は stdlib template-call として受理し、降順 comparator として扱う
- `get<I>(x)` は stdlib template-call として受理し、tuple 要素アクセスとして扱う
- `vector.begin()` / `vector.end()` は method metadata で扱い、返り値は内部 iterator
- `map.size()` は stdlib method registry で実装し、他の `map` メソッドは未対応
- 固定長配列への `sort`（`sort(a, a + n)`）は将来対応

---

## 10. エラー仕様

### 10.1 コンパイルエラー

パース・型チェック段階で検出。GCC / Clang のエラーメッセージ形式に準拠する。
単一ファイル実行が前提なので、既定のファイル名は `main.cpp` とする。

```
main.cpp:<line>:<col>: error: <message>
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

実行中に検出。`Runtime Error: ...` の見出しと、leaf-first の stack trace を返す。

```
Runtime Error: <message>
  at <callee>:<line>
  at <caller>:<line>
  ...
```

| 種別 | メッセージ |
|---|---|
| ゼロ除算 | `Runtime Error: division by zero` |
| 配列範囲外アクセス | `Runtime Error: index 10 out of range for array of size 5` |
| null ポインタ参照 | `Runtime Error: dereference of null pointer` |
| 未初期化変数の読み取り | `Runtime Error: use of uninitialized variable 'x'` |
| 条件式の型不正 | `Runtime Error: cannot convert value to bool` |
| `double` から `int` への不正変換 | `Runtime Error: cannot convert 'double' to 'int'` |

### 10.3 エラー情報の構造

外部 API では、エラーは整形済み文字列だけでなく構造化データとしても返す。

```typescript
type RuntimeStackFrame = {
  functionName: string
  line: number
}

type RuntimeErrorInfo = {
  message: string        // 整形済み全文
  summary: string        // 先頭行に相当する要約
  line: number           // 最上位フレームの行番号
  col: number | null     // compile error のみ列番号を持つ
  functionName: string   // compile error では "<compile>"
  filename: string | null
  stack: RuntimeStackFrame[]
}
```

- compile error では `filename` に `main.cpp` が入り、`stack` は空
- runtime error では `filename` は `null`、`stack` に `callee` から `main` までのフレーム列が入る
- `message` は UI 表示用、`summary` と `stack` は機械処理用と考える

### 10.4 警告

エラーではないが UI 上に表示する。

| 種別 | メッセージ例 |
|---|---|
| 現状なし | 実装は非 `void` 関数の末尾到達を警告ではなくデフォルト値返却として扱う |

---

## 11. 実行モデル

### 11.1 実行時の値表現

```typescript
type RuntimeObjectValue =
  | { kind: "object"; objectKind: "vector"; type: VectorTypeNode; ref: number }
  | { kind: "object"; objectKind: "map"; type: MapTypeNode; entries: { key: Value; value: Value }[] }
  | { kind: "object"; objectKind: "pair"; type: PairTypeNode; first: Value; second: Value }
  | { kind: "object"; objectKind: "tuple"; type: TupleTypeNode; values: Value[] }
  | { kind: "object"; objectKind: "iterator"; type: IteratorTypeNode; ref: number; index: number }

type Value =
  | { kind: "int"; value: bigint }
  | { kind: "double"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "char"; value: string }
  | { kind: "string"; value: string }
  | RuntimeObjectValue
  | { kind: "array"; ref: number; type: TypeNode }
  | { kind: "pointer"; pointeeType: TypeNode; target: RuntimeLocation | null }
  | { kind: "reference"; type: ReferenceTypeNode; target: RuntimeLocation }
  | { kind: "void" }
  | { kind: "uninitialized"; expectedType: TypeNode }
```

- `vector`、`map`、`pair`、`tuple`、`__iterator` はすべて `kind: "object"` に統一し、`objectKind` で種別を識別する
- `vector` の実体は内部 `ArrayStore` に `ref` 経由でアクセスする（固定長配列と同じストレージを共用）
- `map` の entries は inline に保持する（対応する `ArrayStore` は持たない）
- `pair` / `tuple` の要素値は inline に保持する
- `__iterator` は `vector` の `begin()/end()` が返す内部型。`sort`/`reverse`/`fill` 専用で、ユーザー定義 iterator は非対応
- pointer / reference は `RuntimeLocation` を通じて、変数・配列要素・pair メンバー・tuple 要素・文字列要素を指せる
- `uninitialized` はローカル未初期化変数の表現であり、読み取り時に実行時エラーになる

```typescript
type RuntimeLocation =
  | { kind: "binding"; scope: Map<string, Value>; name: string; type: TypeNode }
  | { kind: "array"; ref: number; index: number; type: TypeNode }
  | { kind: "object"; parent: RuntimeLocation; objectKind: "map"; entryIndex: number; type: TypeNode; access: "entry" | "value" }
  | { kind: "object"; parent: RuntimeLocation; objectKind: "pair"; member: "first" | "second"; type: TypeNode }
  | { kind: "object"; parent: RuntimeLocation; objectKind: "tuple"; index: number; type: TypeNode }
  | { kind: "string"; parent: RuntimeLocation; index: number }
```

### 11.2 スコープとストレージ

```typescript
type Scope = Map<string, Value>

type Frame = {
  functionName: string
  line: number
}

type ArrayStore = {
  type: ArrayTypeNode | VectorTypeNode
  values: Value[]
}
```

- 実行中のブロックスコープは `scopeStack: Scope[]` で管理する
- 関数呼び出し履歴は `frameStack: Frame[]` で管理する
- 固定長配列と `vector` の実体は `Map<ArrayId, ArrayStore>` に保持する（`vector` は `objectKind: "vector"` の Value が `ref` で参照）
- 多次元固定長配列は内部的には平坦化した 1 次元ストレージとして管理する
- 実行時エラー発生時は `frameStack` をもとに stack trace を組み立て、最内周フレームから順に露出する

### 11.3 名前解決

1. 現在の `scopeStack` を内側から外側へ探索
2. 見つからなければグローバル変数を探索
3. 見つからなければコンパイルエラーまたは内部エラー

### 11.4 実行状態の公開

```typescript
type DebugInfo = {
  currentLine: number
  callStack: FrameView[]
  localVars: ScopeView[]
  globalVars: DebugValueView[]
  arrays: ArrayView[]
  watchList: WatchView[]
  input: { tokens: string[]; nextIndex: number }
  executionRange: DebugExecutionRange | null
}
```

- 実行状態は UI 更新用にシリアライズしやすい形で公開する
- `watchList` フィールドは型上は存在するが、現状は常に空

---

## 12. デバッグ機能

### 12.1 ステップ実行 API

| メソッド | 動作 |
|---|---|
| `stepInto()` | 次の停止点まで 1 ステップ進む |
| `stepOver()` | 現在の関数深さを超えない範囲で次の文まで進む |
| `stepOut()` | 現在の関数から抜けるまで進む |
| `run()` | 次のブレークポイントまたは終了まで実行する |
| `pause()` | `status === "running"` のときのみ `paused` に遷移させる |

- `DebugSession` は再開ごとにプログラムを先頭から再実行し、前回の `stepCount` までスキップする方式を採る
- そのため巻き戻しや途中状態の永続化はまだ未実装

### 12.2 ブレークポイント

- 行番号単位で設定・解除可能
- `run()` 中は statement ステップでのみブレークポイント判定する
- 条件付きブレークポイントは未対応

### 12.3 停止時に観測できる情報

- コールスタック
- ローカル変数のスコープ階層
- グローバル変数
- 配列 / `vector` の全要素
- 入力トークン列と消費位置
- 現在評価中のソース範囲
- `pauseReason` (`step` または `breakpoint`)

---

## 13. 文法（実装に即した EBNF）

```ebnf
program       = { global_decl } { function } ;

(* グローバル宣言 *)
global_decl   = var_decl | array_decl | vector_decl ;

(* 関数 *)
function      = type declarator "(" param_list ")" block ;
param_list    = [ param { "," param } ] ;
param         = type declarator ;

(* 型 *)
type          = primitive_type
              | "vector" "<" type ">"
              | "pair" "<" type "," type ">"
              | "tuple" "<" type { "," type } ">" ;
primitive_type = "int" | "long long" | "double" | "bool" | "string" | "void" ;
declarator    = { "*" } [ "&" ] ident { "[" [ int_lit ] "]" } ;

(* 文 *)
block         = "{" { statement } "}" ;
stmt_or_block = block | statement ;
statement     = var_decl
              | array_decl
              | vector_decl
              | decl_group_stmt
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
decl_group_stmt = type decl_item "," decl_item { "," decl_item } ";" ;
decl_item     = var_item | array_item | vector_item ;
var_item      = ident [ "=" expr ] ;
array_decl    = type array_item { "," array_item } ";" ;
array_item    = ident "[" int_lit "]" [ "=" "{" [ expr_list ] "}" ] ;
vector_decl   = "vector" "<" type ">" vector_item { "," vector_item } ";" ;
vector_item   = ident [ "(" [ expr [ "," expr ] ] ")" ] ;

if_stmt       = "if" "(" expr ")" stmt_or_block
                { "else" "if" "(" expr ")" stmt_or_block }
                [ "else" stmt_or_block ] ;

for_stmt      = "for" "(" for_init [ expr ] ";" [ for_update ] ")" stmt_or_block ;
range_for_stmt = "for" "(" range_binding ":" expr ")" stmt_or_block ;
range_binding = ( type | "auto" ) [ "&" ] ident ;
for_init      = var_decl
              | decl_group_stmt
              | assign_expr ";"
              | ";" ;
for_update    = assign_expr | postfix_expr ;

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

(* 式（優先順位は §5.7 に従う） *)
expr          = assign_expr ;
assign_expr   = conditional [ assign_op assign_expr ] ;
conditional   = logical_or [ "?" assign_expr ":" conditional ] ;
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
primary       = int_lit
              | float_lit
              | bool_lit
              | string_lit
              | ident
              | tuple_get
              | template_call
              | "endl"
              | "(" expr ")" ;

lvalue        = ident | ident "[" expr "]" | "*" unary | tuple_get | member_access ;
arg_list      = [ expr { "," expr } ] ;
expr_list     = expr { "," expr } ;
method_call   = ident "(" arg_list ")" ;
member_access = ident "." ident ;
template_call = ident "<" (type | int_lit) { "," (type | int_lit) } ">" "(" arg_list ")" ;
tuple_get     = "get" "<" int_lit ">" "(" expr ")" ;

(* リテラル *)
int_lit       = ["-"] digit { digit } ;
float_lit     = ["-"] digit { digit } "." digit { digit } ;
bool_lit      = "true" | "false" ;
string_lit    = '"' { char } '"' ;
ident         = letter { letter | digit | "_" } ;
```

---

## 14. AST ノード定義

```typescript
type ProgramNode = {
  kind: "Program"
  globals: GlobalDeclNode[]
  functions: (FunctionDeclNode | TemplateFunctionDeclNode)[]
}

type GlobalDeclNode = VarDeclNode | ArrayDeclNode

type StatementNode =
  | BlockStmtNode
  | DeclGroupStmtNode
  | VarDeclNode
  | ArrayDeclNode
  | RangeForStmtNode
  | IfStmtNode
  | ForStmtNode
  | WhileStmtNode
  | ReturnStmtNode
  | BreakStmtNode
  | ContinueStmtNode
  | ExprStmtNode
  | CoutStmtNode
  | CerrStmtNode
  | CinStmtNode

type ExprNode =
  | AssignExprNode
  | ConditionalExprNode
  | BinaryExprNode
  | UnaryExprNode
  | AddressOfExprNode
  | DerefExprNode
  | CallExprNode
  | TemplateIdExprNode
  | TemplateCallExprNode
  | MemberAccessExprNode
  | MethodCallExprNode
  | IndexExprNode
  | IdentifierExprNode
  | LiteralExprNode

type AssignTargetNode =
  | IdentifierExprNode
  | IndexExprNode
  | DerefExprNode
  | MemberAccessExprNode
  | TemplateCallExprNode

type TemplateFunctionDeclNode = {
  kind: "TemplateFunctionDecl"
  typeParams: string[]
  returnType: TypeNode
  name: string
  params: ParamNode[]
  body: BlockStmtNode
}

type TemplateIdExprNode = {
  kind: "TemplateIdExpr"
  template: string
  templateArgs: TemplateArgNode[]
}

type TemplateArgNode = TypeTemplateArgNode | IntTemplateArgNode

type TemplateCallExprNode = {
  kind: "TemplateCallExpr"
  callee: TemplateIdExprNode
  args: ExprNode[]
}

type LiteralExprNode = {
  kind: "Literal"
  valueType: "int" | "double" | "bool" | "string"
}
```

---

## 15. 実装状況と未対応項目

### 15.1 現在サポートしている主な機能

- `int` / `long long` / `double` / `bool` / `string`
- 固定長配列、`vector`
- pointer / reference、基本的なポインタ演算
- `pair<T, U>`、`tuple<T...>`、`make_pair`、`make_tuple`、`get<I>`
- 限定的な関数テンプレート（`template<typename T> ...` + 型推論 / 明示テンプレート実引数呼び出し）
- `if` / `for` / range-based `for` / `while` / `break` / `continue`
- 関数定義・再帰・グローバル変数
- `cin` / `cout` / `cerr` / `endl`
- `abs` / `max` / `min` / `swap` / `sort` / `reverse` / `fill`
- `DebugSession` による `stepInto` / `stepOver` / `stepOut` / `run` / ブレークポイント

### 15.2 現在未対応または限定対応の項目

- クラステンプレート、変数テンプレート
- 部分特殊化、明示特殊化、オーバーロード解決
- `struct` / `class`
- 一般の `auto` 変数宣言、構造化束縛
- 参照戻り値
- 固定長配列への `sort(a, a + n)`
- internal iterator は `__iterator<...>` として内部表現されるが、ユーザー定義 iterator は未対応
- 条件付きプリプロセッサ（`#if`, `#ifdef`, `#ifndef`, `#else`, `#endif`）
- 条件付きブレークポイント
- 巻き戻し実行
- `watchList` の実評価
- 完全な C++ 互換 I/O flush / tie セマンティクス

---

## 16. 設計上の原則

1. **競プロ断片の再現を優先する**：C++ 全体ではなく、競技プログラミングで頻出の表面記法を安全に再現する
2. **テンプレートは限定実装だが、AST と stdlib dispatch は C++ 風に揃える**：関数テンプレートは型推論付き呼び出しと明示テンプレート実引数呼び出しをサポートし、`vector<T>`、`pair<T,U>`、`tuple<T...>`、`get<I>`、`greater<int>()` などは一般の template-id / template-call として扱う
3. **エラーは結果として返す**：外部 API では `status: "error"` とエラー情報で伝達する
4. **状態は可視化しやすく保つ**：デバッグ UI 連携を前提に、配列実体・スコープ・現在位置を明示的に保持する
5. **C++ と完全一致しない点は明文化する**：`vector` の参照セマンティクス、`endl` の no-op flush、再開時の再実行などは仕様として記述する
