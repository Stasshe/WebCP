import { describe, it, expect } from "vitest";
import { compile, compileAndRun } from "./test-helper";

describe("Basics", () => {
  it("compile minimal main", () => {
    const source = `
int main() {
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(true);
  });

  it("arithmetic and cout", () => {
    const source = `
int main() {
  int a = 10;
  int b = 3;
  cout << a + b << "\\n";
  cout << a / b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("13\n3\n");
  });

  it("cin reads integers", () => {
    const source = `
int main() {
  int a;
  int b;
  cin >> a >> b;
  cout << a * b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "6 7");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("42\n");
  });

  it("variable declaration and initialization", () => {
    const source = `
int main() {
  int x = 5;
  int y = 10;
  cout << x + y << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("15\n");
  });

  it("multiple arithmetic operations", () => {
    const source = `
int main() {
  int a = 20;
  int b = 4;
  cout << a - b << "\\n";
  cout << a * b << "\\n";
  cout << a / b << "\\n";
  cout << a % b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("16\n80\n5\n0\n");
  });

  it("cout with multiple expressions", () => {
    const source = `
int main() {
  int x = 100;
  cout << "x=" << x << " " << x + 50 << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("x=100 150\n");
  });

  it("using namespace std is accepted", () => {
    const source = `
using namespace std;

int main() {
  cout << "ok\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\n");
  });
});
