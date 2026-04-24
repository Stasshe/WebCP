import { describe, it, expect } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Functions", () => {
  it("simple function call", () => {
    const source = `
int add(int a, int b) {
  return a + b;
}

int main() {
  int result = add(3, 4);
  cout << result << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n");
  });

  it("function with no parameters", () => {
    const source = `
int getValue() {
  return 42;
}

int main() {
  cout << getValue() << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("42\n");
  });

  it("void function", () => {
    const source = `
void printTwice(int x) {
  cout << x << "\\n";
  cout << x << "\\n";
}

int main() {
  printTwice(5);
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n5\n");
  });

  it("function with multiple parameters", () => {
    const source = `
int max(int a, int b, int c) {
  if (a >= b && a >= c) return a;
  if (b >= a && b >= c) return b;
  return c;
}

int main() {
  cout << max(5, 10, 3) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("factorial with recursion", () => {
    const source = `
int factorial(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

int main() {
  cout << factorial(5) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("120\n");
  });

  it("fibonacci with recursion", () => {
    const source = `
int fib(int n) {
  if (n <= 1) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

int main() {
  cout << fib(6) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("8\n");
  });

  it("sumTo function with while loop", () => {
    const source = `
int sumTo(int n) {
  int i = 1;
  int s = 0;
  while (i <= n) {
    s += i;
    i++;
  }
  return s;
}

int main() {
  int x = sumTo(5);
  if (x == 15) {
    cout << "ok\\n";
  } else {
    cout << "ng\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\n");
  });

  it("function modifying local variables", () => {
    const source = `
int doubleAndAdd(int a) {
  a = a * 2;
  a = a + 5;
  return a;
}

int main() {
  int x = 10;
  cout << doubleAndAdd(x) << "\\n";
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("25\n10\n");
  });

  it("multiple function calls", () => {
    const source = `
int square(int x) {
  return x * x;
}

int cube(int x) {
  return x * x * x;
}

int main() {
  cout << square(3) << "\\n";
  cout << cube(3) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("9\n27\n");
  });
});
