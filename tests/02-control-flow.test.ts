import { describe, it, expect } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Control Flow", () => {
  it("if else statement", () => {
    const source = `
int main() {
  int x = 10;
  if (x > 5) {
    cout << "big\\n";
  } else {
    cout << "small\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("big\n");
  });

  it("if else if else statement", () => {
    const source = `
int main() {
  int x = 7;
  if (x < 5) {
    cout << "small\\n";
  } else if (x < 10) {
    cout << "medium\\n";
  } else {
    cout << "big\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("medium\n");
  });

  it("while loop", () => {
    const source = `
int main() {
  int i = 0;
  while (i < 5) {
    cout << i << "\\n";
    i++;
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n2\n3\n4\n");
  });

  it("for loop", () => {
    const source = `
int main() {
  for (int i = 0; i < 3; i++) {
    cout << i << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n2\n");
  });

  it("break in loop", () => {
    const source = `
int main() {
  for (int i = 0; i < 10; i++) {
    if (i == 3) {
      break;
    }
    cout << i << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n2\n");
  });

  it("continue in loop", () => {
    const source = `
int main() {
  for (int i = 0; i < 5; i++) {
    if (i == 2) {
      continue;
    }
    cout << i << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n3\n4\n");
  });

  it("nested loops", () => {
    const source = `
int main() {
  for (int i = 0; i < 2; i++) {
    for (int j = 0; j < 3; j++) {
      cout << i << " " << j << "\\n";
    }
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe(
      "0 0\n0 1\n0 2\n1 0\n1 1\n1 2\n"
    );
  });

  it("logical AND operator", () => {
    const source = `
int main() {
  int x = 5;
  int y = 10;
  if (x > 0 && y > 0) {
    cout << "both positive\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("both positive\n");
  });

  it("logical OR operator", () => {
    const source = `
int main() {
  int x = -5;
  int y = 10;
  if (x > 0 || y > 0) {
    cout << "at least one positive\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("at least one positive\n");
  });

  it("logical NOT operator", () => {
    const source = `
int main() {
  bool flag = true;
  if (!flag) {
    cout << "false\\n";
  } else {
    cout << "true\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("true\n");
  });
});
