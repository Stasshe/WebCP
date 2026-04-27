import { describe, expect, it } from "vitest";
import { compile, compileAndRun } from "./test-helper";

describe("Template Functions", () => {
  it("infers type from single param", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T myabs(T a) {
  if (a < 0) return -a;
  return a;
}
int main() {
  cout << myabs(-5) << '\\n';
  cout << myabs(3) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n3\n");
  });

  it("chmin/chmax via reference template", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
void chmin(T& a, T b) {
  if (b < a) a = b;
}
template<typename T>
void chmax(T& a, T b) {
  if (b > a) a = b;
}
int main() {
  int x = 10;
  chmin(x, 3);
  cout << x << '\\n';
  chmax(x, 7);
  cout << x << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n7\n");
  });

  it("two type params", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T mymax(T a, T b) {
  return a > b ? a : b;
}
int main() {
  cout << mymax(4, 7) << '\\n';
  cout << mymax(-1, -5) << '\\n';
  return 0;
}
`,
      "",
    );
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n-1\n");
  });

  it("redefinition error", () => {
    const result = compileAndRun(
      `
#include<iostream>
using namespace std;
template<typename T>
T foo(T a) { return a; }
template<typename T>
T foo(T a) { return a; }
int main() { return 0; }
`,
      "",
    );
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/redefinition of function/);
  });

  it("rejects conflicting type deduction", () => {
    const result = compile(
      `
#include<iostream>
using namespace std;
template<typename T>
T same(T a, T b) {
  return a;
}
int main() {
  cout << same(true, 1) << '\\n';
  return 0;
}
`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected compile error");
    }
    expect(result.errors[0]?.message).toMatch(/cannot deduce template arguments/);
  });
});
