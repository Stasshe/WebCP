import { describe, expect, it } from "vitest";
import { compile, compileAndRun } from "./test-helper";

// ─── Competitive-programming oriented template usage ─────────────────────────

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

describe("Template: recursive template function", () => {
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
  while (head < q.size()) {
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

  it("coordinate compression using sort and template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void uniqueSort(vector<T>& v) {
  sort(v.begin(), v.end());
  vector<T> tmp;
  for (int i = 0; i < v.size(); i++) {
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
