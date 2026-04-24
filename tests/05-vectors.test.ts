import { describe, it, expect } from "vitest";
import { compileAndRun } from "./test-helper";

describe("Vectors", () => {
  it("vector empty constructor", () => {
    const source = `
int main() {
  vector<int> v;
  cout << v.empty() << "\\n";
  cout << v.size() << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n0\n");
  });

  it("vector with size constructor", () => {
    const source = `
int main() {
  vector<int> v(5);
  cout << v.size() << "\\n";
  cout << v[0] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n0\n");
  });

  it("vector with size and value constructor", () => {
    const source = `
int main() {
  vector<int> v(3, 4);
  cout << v[0] + v[1] + v[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("12\n");
  });

  it("vector push_back and size", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(5);
  v.push_back(8);
  cout << v.size() << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2\n");
  });

  it("vector back, pop_back", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(5);
  v.push_back(8);
  cout << v.size() << " " << v.back() << "\\n";
  v.pop_back();
  cout << v.size() << " " << v.back() << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2 8\n1 5\n");
  });

  it("vector resize", () => {
    const source = `
int main() {
  vector<int> v(3, 4);
  cout << v[0] + v[1] + v[2] << "\\n";
  v.resize(5);
  cout << v[3] << " " << v[4] << "\\n";
  cout << v.size() << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("12\n0 0\n5\n");
  });

  it("vector clear", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v.push_back(3);
  cout << v.size() << "\\n";
  v.clear();
  cout << v.size() << " " << v.empty() << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n0 1\n");
  });

  it("vector index access and modification", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(10);
  v.push_back(20);
  v.push_back(30);
  v[1] = 25;
  cout << v[0] << " " << v[1] << " " << v[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10 25 30\n");
  });

  it("vector iteration", () => {
    const source = `
int main() {
  vector<int> v;
  for (int i = 0; i < 5; i++) {
    v.push_back(i * 2);
  }
  for (int i = 0; i < v.size(); i++) {
    cout << v[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n2\n4\n6\n8\n");
  });

  it("vector passed to function", () => {
    const source = `
void fillVector(vector<int> v, int size, int value) {
  for (int i = 0; i < size; i++) {
    v.push_back(value);
  }
}

int main() {
  vector<int> v;
  fillVector(v, 3, 7);
  cout << v.size() << "\\n";
  for (int i = 0; i < v.size(); i++) {
    cout << v[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n7\n7\n7\n");
  });

  it("vector of strings", () => {
    const source = `
int main() {
  vector<string> v;
  v.push_back("hello");
  v.push_back("world");
  cout << v[0] + " " + v[1] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("hello world\n");
  });

  it("builtins abs max min swap", () => {
    const source = `
int main() {
  int a = -5;
  int b = 3;
  cout << abs(a) << "\\n";
  cout << max(a, b) << "\\n";
  cout << min(a, b) << "\\n";
  swap(a, b);
  cout << a << " " << b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n3\n-5\n3 -5\n");
  });

  it("sort vector ascending", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(3);
  v.push_back(1);
  v.push_back(2);
  sort(v.begin(), v.end());
  for (int i = 0; i < v.size(); i++) {
    cout << v[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n2\n3\n");
  });

  it("sort vector descending with greater", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(3);
  v.push_back(1);
  v.push_back(2);
  sort(v.begin(), v.end(), greater<int>());
  for (int i = 0; i < v.size(); i++) {
    cout << v[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n2\n1\n");
  });

  it("reverse and fill vector", () => {
    const source = `
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v.push_back(3);
  reverse(v.begin(), v.end());
  fill(v.begin(), v.end(), 7);
  for (int i = 0; i < v.size(); i++) {
    cout << v[i] << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n7\n7\n");
  });
});
