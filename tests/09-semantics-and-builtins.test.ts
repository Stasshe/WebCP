import { describe, expect, it } from "vitest";
import { compile, compileAndRun } from "./test-helper";

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

  it("unary bitwise not requires int operand", () => {
    const source = `
int main() {
  bool flag = false;
  return ~flag;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/type mismatch: expected int/);
  });

  it("left shift with negative count is runtime error", () => {
    const source = `
int main() {
  int x = 3;
  cout << (x << -2) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/shift count must be non-negative/);
  });

  it("bitwise expressions reject bool operands in mixed precedence", () => {
    const source = `
int main() {
  bool b = true;
  return 1 | b;
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

  it("rejects unordered_map with a clear unsupported-feature error", () => {
    const source = `
int main() {
  unordered_map<long long, long long> freq;
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/this feature is not supported in this interpreter/);
  });

  it("rejects structured bindings in range-for with unsupported-feature error", () => {
    const source = `
int main() {
  vector<int> a(3, 1);
  for (auto& [x, y] : a) {
    x = y;
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/this feature is not supported in this interpreter/);
  });

  it("supports pair declaration with make_pair and member access", () => {
    const source = `
int main() {
  pair<long long, long long> p = make_pair(10, 20);
  cout << p.first << " " << p.second << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10 20\n");
  });

  it("supports vector of pairs", () => {
    const source = `
int main() {
  vector<pair<int, int>> edges;
  edges.push_back(make_pair(2, 5));
  edges.push_back(make_pair(3, 7));
  cout << edges[0].first + edges[1].second << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("9\n");
  });

  it("rejects incompatible ternary branch types", () => {
    const source = `
int main() {
  int x = true ? 1 : "s";
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected compile error");
    }
    expect(result.errors[0]?.message).toMatch(/incompatible operand types for \?:/);
  });

  it("rejects tuple get out of range", () => {
    const source = `
int main() {
  tuple<int, int> t = make_tuple(1, 2);
  return get<2>(t);
}
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected compile error");
    }
    expect(result.errors[0]?.message).toMatch(/tuple index 2 out of range/);
  });

  it("rejects make_tuple with no arguments", () => {
    const source = `
int main() {
  make_tuple();
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected compile error");
    }
    expect(result.errors[0]?.message).toMatch(/make_tuple requires at least 1 argument/);
  });
});
