import { describe, it, expect } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Arrays", () => {
  it("fixed array declaration", () => {
    const source = `
int main() {
  int a[3];
  a[0] = 10;
  a[1] = 20;
  a[2] = 30;
  cout << a[0] + a[1] + a[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("60\n");
  });

  it("fixed array with initialization", () => {
    const source = `
int main() {
  int a[5] = {1, 2};
  a[2] = 7;
  cout << a[0] + a[1] + a[2] + a[3] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("array with full initialization", () => {
    const source = `
int main() {
  int a[4] = {10, 20, 30, 40};
  cout << a[0] << " " << a[1] << " " << a[2] << " " << a[3] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10 20 30 40\n");
  });

  it("array iteration with for loop", () => {
    const source = `
int main() {
  int a[5] = {1, 2, 3, 4, 5};
  for (int i = 0; i < 5; i++) {
    cout << a[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n2\n3\n4\n5\n");
  });

  it("array passed to function", () => {
    const source = `
void fillArray(int a[], int size, int value) {
  for (int i = 0; i < size; i++) {
    a[i] = value;
  }
}

int main() {
  int arr[3];
  fillArray(arr, 3, 7);
  cout << arr[0] << " " << arr[1] << " " << arr[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7 7 7\n");
  });

  it("array sum with function", () => {
    const source = `
int sum(int a[], int size) {
  int s = 0;
  for (int i = 0; i < size; i++) {
    s += a[i];
  }
  return s;
}

int main() {
  int arr[4] = {10, 20, 30, 40};
  cout << sum(arr, 4) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("100\n");
  });

  it("array with negative indices access fails at runtime", () => {
    const source = `
int main() {
  int a[3] = {1, 2, 3};
  cout << a[-1] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error:/);
  });

  it("array out of bounds access fails at runtime", () => {
    const source = `
int main() {
  int a[3] = {1, 2, 3};
  cout << a[10] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("error");
    expect(result.error?.message).toMatch(/Runtime Error:/);
  });

  it("global array", () => {
    const source = `
int globalArr[5] = {1, 2, 3, 4, 5};

int main() {
  cout << globalArr[0] + globalArr[4] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("6\n");
  });

  it("array modification in function affects caller", () => {
    const source = `
void incrementArray(int a[], int size) {
  for (int i = 0; i < size; i++) {
    a[i]++;
  }
}

int main() {
  int arr[3] = {1, 2, 3};
  incrementArray(arr, 3);
  cout << arr[0] << " " << arr[1] << " " << arr[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2 3 4\n");
  });
});
