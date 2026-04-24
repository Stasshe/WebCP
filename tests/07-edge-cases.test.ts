import { describe, it, expect } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Edge Cases", () => {
  it("negative numbers arithmetic", () => {
    const source = `
int main() {
  int a = -10;
  int b = -5;
  cout << a + b << "\\n";
  cout << a - b << "\\n";
  cout << a * b << "\\n";
  cout << a / b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("-15\n-5\n50\n2\n");
  });

  it("unary minus operator", () => {
    const source = `
int main() {
  int x = 5;
  cout << -x << "\\n";
  cout << -(-x) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("-5\n5\n");
  });

  it("operator precedence: multiplication before addition", () => {
    const source = `
int main() {
  int a = 2;
  int b = 3;
  int c = 4;
  cout << a + b * c << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("14\n");
  });

  it("operator precedence: parentheses override", () => {
    const source = `
int main() {
  int a = 2;
  int b = 3;
  int c = 4;
  cout << (a + b) * c << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("20\n");
  });

  it("comparison with zero", () => {
    const source = `
int main() {
  int x = 0;
  if (x == 0) {
    cout << "zero\\n";
  } else {
    cout << "nonzero\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("zero\n");
  });

  it("increment operator prefix", () => {
    const source = `
int main() {
  int x = 5;
  cout << ++x << "\\n";
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("6\n6\n");
  });

  it("increment operator postfix", () => {
    const source = `
int main() {
  int x = 5;
  cout << x++ << "\\n";
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n6\n");
  });

  it("decrement operator", () => {
    const source = `
int main() {
  int x = 5;
  cout << x-- << "\\n";
  cout << --x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n3\n");
  });

  it("compound assignment operators", () => {
    const source = `
int main() {
  int x = 10;
  x += 5;
  cout << x << "\\n";
  x -= 3;
  cout << x << "\\n";
  x *= 2;
  cout << x << "\\n";
  x /= 4;
  cout << x << "\\n";
  x %= 5;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("15\n12\n24\n6\n1\n");
  });

  it("short-circuit evaluation AND", () => {
    const source = `
int main() {
  int x = 0;
  if (x == 0 && 1 / x == 1) {
    cout << "never\\n";
  } else {
    cout << "ok\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\n");
  });

  it("short-circuit evaluation OR", () => {
    const source = `
int main() {
  int x = 0;
  if (x != 0 || 1 / x == 1) {
    cout << "never\\n";
  } else {
    cout << "ok\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\n");
  });

  it("nested if-else", () => {
    const source = `
int main() {
  int x = 5;
  int y = 10;
  if (x > 0) {
    if (y > 0) {
      cout << "both positive\\n";
    } else {
      cout << "x positive\\n";
    }
  } else {
    cout << "x not positive\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("both positive\n");
  });

  it("empty for loop (infinite)", () => {
    const source = `
int main() {
  int count = 0;
  for (;;) {
    cout << count << "\\n";
    count++;
    if (count >= 3) break;
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n2\n");
  });

  it("for loop with no init", () => {
    const source = `
int main() {
  int i = 0;
  for (; i < 3; i++) {
    cout << i << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n2\n");
  });

  it("for loop with no update", () => {
    const source = `
int main() {
  for (int i = 0; i < 3;) {
    cout << i << "\\n";
    i++;
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n2\n");
  });

  it("block scope shadowing", () => {
    const source = `
int main() {
  int x = 10;
  cout << x << "\\n";
  {
    int x = 20;
    cout << x << "\\n";
  }
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n20\n10\n");
  });

  it("multiple declarations in block", () => {
    const source = `
int main() {
  int a = 1;
  int b = 2;
  int c = 3;
  cout << a + b + c << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("6\n");
  });

  it("string comparison", () => {
    const source = `
int main() {
  string s1 = "hello";
  string s2 = "hello";
  string s3 = "world";
  if (s1 == s2) {
    cout << "equal\\n";
  }
  if (s1 != s3) {
    cout << "not equal\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("equal\nnot equal\n");
  });

  it("string concatenation", () => {
    const source = `
int main() {
  string s1 = "hello";
  string s2 = "world";
  string s3 = s1 + " " + s2;
  cout << s3 << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("hello world\n");
  });

  it("global variable initialization", () => {
    const source = `
int globalX = 100;
int globalY = 200;

int main() {
  cout << globalX + globalY << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("300\n");
  });

  it("global array", () => {
    const source = `
int globalArr[3] = {10, 20, 30};

int main() {
  cout << globalArr[0] + globalArr[1] + globalArr[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("60\n");
  });

  it("for loop reverse iteration", () => {
    const source = `
int main() {
  for (int i = 5; i > 0; i--) {
    cout << i << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n4\n3\n2\n1\n");
  });

  it("equality comparison with different values", () => {
    const source = `
int main() {
  if (5 == 5) {
    cout << "equal\\n";
  }
  if (5 != 10) {
    cout << "not equal\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("equal\nnot equal\n");
  });
});
