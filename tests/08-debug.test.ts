import { describe, it, expect } from "vitest";
import { compileAndRun, DebugSession } from "./test-helper";

describe("Debug", () => {
  it("debug session skeleton returns terminal state", () => {
    const source = `
int main() {
  int x = 1;
  x += 2;
  cout << x << "\\n";
  return 0;
}
`;
    const session = new DebugSession(source);
    const state = session.stepInto();
    expect(state.status).toBe("done");
    expect(state.output.stdout).toBe("3\n");
    expect(state.currentLine).toBeGreaterThanOrEqual(1);
  });

  it("debug session with function calls", () => {
    const source = `
int add(int a, int b) {
  return a + b;
}

int main() {
  int x = add(5, 3);
  cout << x << "\\n";
  return 0;
}
`;
    const session = new DebugSession(source);
    const state = session.stepInto();
    expect(state.status).toBe("done");
    expect(state.output.stdout).toBe("8\n");
  });

  it("debug session with loop", () => {
    const source = `
int main() {
  for (int i = 0; i < 2; i++) {
    cout << i << "\\n";
  }
  return 0;
}
`;
    const session = new DebugSession(source);
    const state = session.stepInto();
    expect(state.status).toBe("done");
    expect(state.output.stdout).toBe("0\n1\n");
  });
});
