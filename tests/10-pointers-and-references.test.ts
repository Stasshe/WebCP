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
});
