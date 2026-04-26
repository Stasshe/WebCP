import { describe, expect, it } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Error Handling", () => {
  it("uninitialized variable read is runtime error", () => {
    const source = `
int main() {
  int x;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error:/);
    expect(result.error?.message).toMatch(/uninitialized/);
  });

  it("division by zero error", () => {
    const source = `
int main() {
  int a = 10;
  int b = 0;
  cout << a / b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/division by zero/);
  });

  it("modulo by zero error", () => {
    const source = `
int main() {
  int a = 10;
  int b = 0;
  cout << a % b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/division by zero/);
  });

  it("negative shift count is runtime error", () => {
    const source = `
int main() {
  int x = 8;
  cout << (x >> -1) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/shift count must be non-negative/);
  });

  it("undefined variable error", () => {
    const source = `
int main() {
  cout << undefinedVar << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/not declared/);
  });

  it("fixed array element is zero-initialized", () => {
    const source = `
int main() {
  int a[3];
  cout << a[1] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n");
  });

  it("array access out of bounds negative", () => {
    const source = `
int main() {
  int a[5] = {1, 2, 3, 4, 5};
  cout << a[-1] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error:/);
    expect(result.error?.message).toMatch(/out of range/);
  });

  it("array access out of bounds positive", () => {
    const source = `
int main() {
  int a[3];
  a[0] = 1;
  cout << a[5] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error:/);
    expect(result.error?.message).toMatch(/out of range/);
  });

  it("vector pop_back on empty vector", () => {
    const source = `
int main() {
  vector<int> v;
  v.pop_back();
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error:/);
  });

  it("vector back on empty vector", () => {
    const source = `
int main() {
  vector<int> v;
  cout << v.back() << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error:/);
  });

  it("break outside loop is compile error", () => {
    const source = `
int main() {
  break;
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/not within a loop/);
  });

  it("continue outside loop is compile error", () => {
    const source = `
int main() {
  continue;
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/not within a loop/);
  });

  it("compile errors use main.cpp GCC-style formatting by default", () => {
    const source = `
int main() {
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/^main\.cpp:\d+:\d+: error: /);
    expect(result.error?.summary).toMatch(/was not declared in this scope/);
    expect(result.error?.filename).toBe("main.cpp");
    expect(result.error?.stack).toEqual([]);
  });

  it("runtime errors include a structured stack trace", () => {
    const source = `
void crash() {
  int a[1];
  cout << a[2] << "\\n";
}

void dfs() {
  crash();
}

int main() {
  dfs();
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error: index 2 out of range for array of size 1/);
    expect(result.error?.message).toMatch(/at crash:/);
    expect(result.error?.message).toMatch(/at dfs:/);
    expect(result.error?.message).toMatch(/at main:/);
    expect(result.error?.summary).toBe("index 2 out of range for array of size 1");
    expect(result.error?.stack.map((frame) => frame.functionName)).toEqual(["crash", "dfs", "main"]);
  });
});
