import { describe, expect, it } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Semantics And Builtins", () => {
  it("too many arguments to function is compile error", () => {
    const source = `
int add(int a, int b) {
  return a + b;
}

int main() {
  return add(1, 2, 3);
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/too many arguments to function 'add'/);
  });

  it("void function returning value is compile error", () => {
    const source = `
void f() {
  return 1;
}

int main() {
  f();
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/return-statement with a value/);
  });

  it("non-void function returning without value is compile error", () => {
    const source = `
int f() {
  return;
}

int main() {
  return f();
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/return-statement with no value/);
  });

  it("void main is compile error", () => {
    const source = `
void main() {
  return;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/'main' must return 'int'/);
  });

  it("main with arguments is compile error", () => {
    const source = `
int main(int argc) {
  return argc;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/'main' must not take any arguments/);
  });

  it("swap requires lvalue arguments", () => {
    const source = `
int main() {
  int x = 1;
  int y = 2;
  swap(x + 1, y);
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/swap arguments must be lvalues/);
  });

  it("swap works on array elements", () => {
    const source = `
int main() {
  int a[2] = {10, 20};
  swap(a[0], a[1]);
  cout << a[0] << " " << a[1] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("20 10\n");
  });

  it("fill works on string vectors", () => {
    const source = `
int main() {
  vector<string> v(3, "x");
  fill(v.begin(), v.end(), "ok");
  for (int i = 0; i < v.size(); i++) {
    cout << v[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\nok\nok\n");
  });

  it("sort requires iterators from the same vector", () => {
    const source = `
int main() {
  vector<int> a;
  vector<int> b;
  a.push_back(2);
  b.push_back(1);
  sort(a.begin(), b.end());
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/same vector/);
  });

  it("sort rejects unsupported comparator", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(3);
  v.push_back(1);
  sort(v.begin(), v.end(), max(1, 2));
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/unsupported sort comparator/);
  });

  it("bitwise operators require int operands", () => {
    const source = `
int main() {
  bool flag = true;
  return flag & 1;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/type mismatch: expected int/);
  });

  it("rejects unsupported preprocessor directives", () => {
    const source = `
#ifdef LOCAL
int main() {
  return 0;
}
#endif
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/unsupported preprocessor directive/);
  });
});
