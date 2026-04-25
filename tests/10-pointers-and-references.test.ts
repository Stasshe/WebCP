import { describe, expect, it } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Pointers And References", () => {
  it("reference variable aliases the original object", () => {
    const source = `
int main() {
  int x = 1;
  int &r = x;
  r += 4;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n");
  });

  it("pointer dereference writes through to the target", () => {
    const source = `
int main() {
  int x = 3;
  int *p = &x;
  *p = 9;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("9\n");
  });

  it("function can return a pointer value", () => {
    const source = `
int *pick(int *p) {
  return p;
}

int main() {
  int x = 4;
  int *p = pick(&x);
  *p += 5;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("9\n");
  });

  it("reference parameter requires an lvalue argument", () => {
    const source = `
void inc(int &x) {
  x++;
}

int main() {
  inc(1 + 2);
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/reference argument must be an lvalue/);
  });

  it("multiple pointer declarators share the base type", () => {
    const source = `
int main() {
  int x = 2;
  int y = 5;
  int *p = &x, *q = &y;
  *p += *q;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n");
  });

  it("range-for auto reference mutates vectors", () => {
    const source = `
int main() {
  vector<int> a(3, 2);
  for (auto& x : a) {
    x++;
  }
  for (int i = 0; i < a.size(); i++) {
    cout << a[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n3\n3\n");
  });

  it("range-for auto reference works on fixed arrays", () => {
    const source = `
int main() {
  int a[3] = {1, 2, 3};
  for (auto& x : a) {
    x *= 2;
  }
  cout << a[0] << " " << a[1] << " " << a[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2 4 6\n");
  });

  it("range-for auto reference works on strings", () => {
    const source = `
int main() {
  string s = "abc";
  for (auto& ch : s) {
    if (ch == "b") {
      ch = "z";
    }
  }
  cout << s << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("azc\n");
  });

  it("supports pointer addition and subtraction on array elements", () => {
    const source = `
int main() {
  int a[4] = {10, 20, 30, 40};
  int *p = &a[0];
  int *q = p + 2;
  cout << *q << "\\n";
  q = q - 1;
  cout << *q << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("30\n20\n");
  });

  it("supports symmetric pointer addition with int + pointer", () => {
    const source = `
int main() {
  int a[4] = {10, 20, 30, 40};
  int *p = &a[1];
  int *q = 2 + p;
  cout << *q << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("40\n");
  });

  it("supports pointer compound assignment operators", () => {
    const source = `
int main() {
  int a[5] = {1, 2, 3, 4, 5};
  int *p = &a[0];
  p += 3;
  cout << *p << "\\n";
  p -= 2;
  cout << *p << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("4\n2\n");
  });

  it("supports pointer increment and decrement", () => {
    const source = `
int main() {
  int a[3] = {5, 6, 7};
  int *p = &a[0];
  p++;
  cout << *p << "\\n";
  --p;
  cout << *p << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("6\n5\n");
  });

  it("supports pointer subtraction result as distance", () => {
    const source = `
int main() {
  int a[5] = {1, 2, 3, 4, 5};
  int *p = &a[4];
  int *q = &a[1];
  cout << (p - q) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n");
  });

  it("fails pointer subtraction for different arrays", () => {
    const source = `
int main() {
  int a[2] = {1, 2};
  int b[2] = {3, 4};
  int *p = &a[1];
  int *q = &b[0];
  cout << (p - q) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/same array/);
  });

  it("fails pointer arithmetic on scalar pointer", () => {
    const source = `
int main() {
  int x = 10;
  int *p = &x;
  p = p + 1;
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/pointer to array\/string element/);
  });

  it("allows +0 and -0 on scalar pointers", () => {
    const source = `
int main() {
  int x = 10;
  int *p = &x;
  p = p + 0;
  cout << *p << "\\n";
  p = p - 0;
  cout << *p << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n10\n");
  });

  it("allows one-past pointer creation but fails on dereference", () => {
    const source = `
int main() {
  int a[3] = {1, 2, 3};
  int *p = &a[0];
  int *end = p + 3;
  cout << *end << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/out of range/);
  });

  it("supports null pointer constants 0 and nullptr", () => {
    const source = `
int main() {
  int *p = 0;
  int *q = nullptr;
  if (p == q) {
    cout << "eq\\n";
  }
  cout << *p << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.output.stdout).toBe("eq\n");
    expect(result.error?.message).toMatch(/dereference of null pointer/);
  });
});
