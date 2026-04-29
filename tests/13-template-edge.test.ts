import { describe, expect, it } from "vitest";
import { compile, compileAndRun } from "./test-helper";

// ─── Substitution correctness (paths fixed in template-instantiator) ──────────

describe("Template: substitution in all statement types", () => {
  it("for-loop condition and update contain T expression", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T sumUpTo(T n) {
  T acc = 0;
  for (T i = 1; i <= n; i = i + 1) {
    acc = acc + i;
  }
  return acc;
}
int main() {
  cout << sumUpTo(10) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("55\n");
  });

  it("while-loop condition contains T expression", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T countDown(T n) {
  T count = 0;
  while (n > 0) {
    count = count + 1;
    n = n - 1;
  }
  return count;
}
int main() {
  cout << countDown(7) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n");
  });

  it("if-condition contains T expression", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T clamp(T v, T lo, T hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
int main() {
  cout << clamp(3, 5, 10) << '\\n';
  cout << clamp(7, 5, 10) << '\\n';
  cout << clamp(15, 5, 10) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n7\n10\n");
  });

  it("range-for over vector<T> inside template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T sumVec(vector<T> v) {
  T acc = 0;
  for (auto x : v) {
    acc = acc + x;
  }
  return acc;
}
int main() {
  vector<int> v(5, 3);
  cout << sumVec(v) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("15\n");
  });

  it("VarDecl initializer contains T expression", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T square(T x) {
  T result = x * x;
  return result;
}
int main() {
  cout << square(9) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("81\n");
  });
});

// ─── Template with standard containers ───────────────────────────────────────

describe("Template: with vector<T>", () => {
  it("passes vector<T> by reference and modifies it", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void fillWith(vector<T>& v, T val) {
  fill(v.begin(), v.end(), val);
}
int main() {
  vector<int> v(4, 0);
  fillWith(v, 7);
  for (auto x : v) cout << x << ' ';
  cout << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7 7 7 7 \n");
  });

  it("returns vector<T>", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
vector<T> makeVec(T a, T b, T c) {
  vector<T> v;
  v.push_back(a);
  v.push_back(b);
  v.push_back(c);
  return v;
}
int main() {
  vector<int> v = makeVec(1, 2, 3);
  for (auto x : v) cout << x << ' ';
  cout << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1 2 3 \n");
  });

  it("sort vector<T> inside template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void sortDesc(vector<T>& v) {
  sort(v.begin(), v.end(), greater<int>());
}
int main() {
  vector<int> v;
  v.push_back(3);
  v.push_back(1);
  v.push_back(4);
  v.push_back(1);
  v.push_back(5);
  sortDesc(v);
  for (auto x : v) cout << x << ' ';
  cout << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5 4 3 1 1 \n");
  });

  it("push_back into vector<T> inside template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
vector<T> repeat(T val, int n) {
  vector<T> v;
  for (int i = 0; i < n; i++) {
    v.push_back(val);
  }
  return v;
}
int main() {
  vector<int> v = repeat(42, 3);
  for (auto x : v) cout << x << ' ';
  cout << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("42 42 42 \n");
  });
});

describe("Template: two type params (T, U)", () => {
  it("pair<T,U> construction via template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T, typename U>
pair<T, U> makePairOf(T a, U b) {
  return make_pair(a, b);
}
int main() {
  pair<int, int> p = makePairOf(3, 7);
  cout << p.first << ' ' << p.second << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3 7\n");
  });

  it("swaps values of same type T via reference", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void myswap(T& a, T& b) {
  T tmp = a;
  a = b;
  b = tmp;
}
int main() {
  int x = 10, y = 20;
  myswap(x, y);
  cout << x << ' ' << y << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("20 10\n");
  });
});

// ─── chmin / chmax patterns (typical competitive programming) ─────────────────

describe("Template: chmin/chmax competitive patterns", () => {
  it("chmin with int", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void chmin(T& a, T b) { if (b < a) a = b; }
int main() {
  int ans = 1000000;
  chmin(ans, 500);
  chmin(ans, 300);
  chmin(ans, 700);
  cout << ans << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("300\n");
  });

  it("chmax with double", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void chmax(T& a, T b) { if (b > a) a = b; }
int main() {
  double best = 0.0;
  chmax(best, 1.5);
  chmax(best, 3.0);
  chmax(best, 2.0);
  cout << best << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n");
  });

  it("chmin in 1D DP loop", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void chmin(T& a, T b) { if (b < a) a = b; }
int main() {
  int n = 5;
  int INF = 1000000;
  vector<int> dp(n + 1, INF);
  dp[0] = 0;
  for (int i = 1; i <= n; i++) {
    chmin(dp[i], dp[i - 1] + 1);
    if (i >= 2) chmin(dp[i], dp[i - 2] + 1);
  }
  cout << dp[5] << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n");
  });
});

// ─── Template calling template ────────────────────────────────────────────────

describe("Template: template calling template", () => {
  it("inner template inferred from outer T", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T myabs(T a) { return a < 0 ? -a : a; }
template<typename T>
T absDiff(T a, T b) {
  return myabs(a - b);
}
int main() {
  cout << absDiff(3, 7) << '\\n';
  cout << absDiff(10, 4) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("4\n6\n");
  });

  it("explicit inner template type from outer T", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T twice(T x) { return x + x; }
template<typename T>
T quad(T x) { return twice<T>(twice<T>(x)); }
int main() {
  cout << quad(3) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("12\n");
  });
});

// ─── Template recursive function ──────────────────────────────────────────────

describe("Template: recursive template function", () => {
  it("recursive sum via template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T sumRec(T n) {
  if (n <= 0) return 0;
  return n + sumRec(n - 1);
}
int main() {
  cout << sumRec(10) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("55\n");
  });

  it("recursive gcd via template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T mygcd(T a, T b) {
  if (b == 0) return a;
  return mygcd(b, a % b);
}
int main() {
  cout << mygcd(12, 8) << '\\n';
  cout << mygcd(100, 75) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("4\n25\n");
  });
});

// ─── Template with pointer param ──────────────────────────────────────────────

describe("Template: T* pointer parameter", () => {
  it("template function taking T* array pointer", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T arraySum(T* arr, int n) {
  T acc = 0;
  for (int i = 0; i < n; i++) acc = acc + arr[i];
  return acc;
}
int main() {
  int a[5] = {1, 2, 3, 4, 5};
  cout << arraySum(a, 5) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("15\n");
  });
});

// ─── Competitive programming patterns ────────────────────────────────────────

describe("Template: competitive programming BFS/DFS/DP patterns", () => {
  it("BFS on adjacency list with template helper", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void addEdge(vector<vector<T>>& g, T u, T v) {
  g[u].push_back(v);
  g[v].push_back(u);
}
int main() {
  int n = 5;
  vector<vector<int>> g(n);
  addEdge(g, 0, 1);
  addEdge(g, 0, 2);
  addEdge(g, 1, 3);
  addEdge(g, 2, 4);
  vector<int> dist(n, -1);
  vector<int> q;
  dist[0] = 0;
  q.push_back(0);
  int head = 0;
  while (head < (int)q.size()) {
    int v = q[head];
    head++;
    for (auto u : g[v]) {
      if (dist[u] == -1) {
        dist[u] = dist[v] + 1;
        q.push_back(u);
      }
    }
  }
  for (int i = 0; i < n; i++) cout << dist[i] << ' ';
  cout << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0 1 1 2 2 \n");
  });

  it("2D DP with chmin template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void chmin(T& a, T b) { if (b < a) a = b; }
int main() {
  int n = 3, m = 3;
  int INF = 1000000;
  vector<vector<int>> dp(n, vector<int>(m, INF));
  dp[0][0] = 0;
  for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
      if (dp[i][j] == INF) continue;
      if (i + 1 < n) chmin(dp[i + 1][j], dp[i][j] + 1);
      if (j + 1 < m) chmin(dp[i][j + 1], dp[i][j] + 1);
    }
  }
  cout << dp[n - 1][m - 1] << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("4\n");
  });

  it("DFS with template-parameterized visited array", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
vector<vector<int>> graph;
vector<bool> visited;
template<typename T>
void dfs(T v) {
  visited[v] = true;
  for (auto u : graph[v]) {
    if (!visited[u]) dfs(u);
  }
}
int main() {
  graph.resize(4);
  visited.resize(4, false);
  graph[0].push_back(1);
  graph[0].push_back(2);
  graph[1].push_back(3);
  dfs(0);
  for (int i = 0; i < 4; i++) cout << (visited[i] ? 1 : 0) << ' ';
  cout << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1 1 1 1 \n");
  });

  it("coordinate compression using sort and template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void uniqueSort(vector<T>& v) {
  sort(v.begin(), v.end());
  vector<T> tmp;
  for (int i = 0; i < (int)v.size(); i++) {
    if (i == 0 || v[i] != v[i - 1]) {
      tmp.push_back(v[i]);
    }
  }
  v = tmp;
}
int main() {
  vector<int> v;
  v.push_back(3);
  v.push_back(1);
  v.push_back(4);
  v.push_back(1);
  v.push_back(5);
  v.push_back(9);
  v.push_back(2);
  v.push_back(6);
  v.push_back(5);
  uniqueSort(v);
  for (auto x : v) cout << x << ' ';
  cout << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1 2 3 4 5 6 9 \n");
  });

  it("sort pairs with template chmax to track maximum across pairs", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void chmax(T& a, T b) { if (b > a) a = b; }
int main() {
  vector<pair<int, int>> events;
  events.push_back(make_pair(3, 10));
  events.push_back(make_pair(1, 5));
  events.push_back(make_pair(2, 8));
  sort(events.begin(), events.end());
  int maxVal = 0;
  for (auto p : events) {
    chmax(maxVal, p.second);
  }
  cout << maxVal << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });
});

// ─── Error cases ──────────────────────────────────────────────────────────────

describe("Template: error cases", () => {
  it("rejects call where T cannot be inferred from all params", () => {
    const result = compile(
      `
#include<iostream>
using namespace std;
template<typename T, typename U>
void f(T a) {}
int main() {
  f(1);
  return 0;
}
`,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects conflicting deduction across params", () => {
    const result = compile(
      `
#include<iostream>
using namespace std;
template<typename T>
T same(T a, T b) { return a; }
int main() {
  cout << same(1, true) << '\\n';
  return 0;
}
`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected compile error");
    expect(result.errors[0]?.message).toMatch(/cannot deduce template arguments/);
  });
});
