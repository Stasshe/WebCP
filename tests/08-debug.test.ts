import { describe, it, expect } from "vitest";
import { DebugSession } from "./test-helper";

describe("Debug", () => {
  it("stepInto pauses on each next node and exposes state", () => {
    const source = `
int main() {
  int x = 1;
  x += 2;
  cout << x << "\\n";
  return 0;
}
`;
    const session = new DebugSession(source);

    const first = session.stepInto();
    expect(first.status).toBe("paused");
    expect(first.currentLine).toBe(3);
    expect(first.localVars).toHaveLength(1);
    expect(first.localVars[0]?.vars).toEqual([]);

    const second = session.stepInto();
    expect(second.status).toBe("paused");
    expect(second.currentLine).toBe(3);
    expect(second.localVars[0]?.vars).toEqual([]);

    const third = session.stepInto();
    expect(third.status).toBe("paused");
    expect(third.currentLine).toBe(4);
    expect(third.localVars[0]?.vars).toEqual([{ name: "x", kind: "int", value: "1" }]);

    session.stepInto();
    session.stepInto();
    const seventh = session.stepInto();
    expect(seventh.status).toBe("paused");
    expect(seventh.currentLine).toBe(5);
    expect(seventh.localVars[0]?.vars).toEqual([{ name: "x", kind: "int", value: "3" }]);

    const done = session.run();
    expect(done.status).toBe("done");
    expect(done.output.stdout).toBe("3\n");
  });

  it("stepOver executes function calls without entering the callee", () => {
    const source = `
int add(int a, int b) {
  int c = a + b;
  return c;
}

int main() {
  int x = add(5, 3);
  cout << x << "\\n";
  return 0;
}
`;
    const session = new DebugSession(source);

    expect(session.stepInto().currentLine).toBe(8);

    const over = session.stepOver();
    expect(over.status).toBe("paused");
    expect(over.currentLine).toBe(9);
    expect(over.callStack).toEqual([{ functionName: "main", line: 9 }]);
    expect(over.localVars[0]?.vars).toEqual([{ name: "x", kind: "int", value: "8" }]);
  });

  it("stepOut runs until the caller frame", () => {
    const source = `
int add(int a, int b) {
  int c = a + b;
  return c;
}

int main() {
  int x = add(5, 3);
  cout << x << "\\n";
  return 0;
}
`;
    const session = new DebugSession(source);

    for (let i = 0; i < 5; i += 1) {
      session.stepInto();
    }
    const intoCall = session.getState();
    expect(intoCall.callStack).toEqual([
      { functionName: "main", line: 8 },
      { functionName: "add", line: 3 },
    ]);

    const out = session.stepOut();
    expect(out.status).toBe("paused");
    expect(out.callStack).toEqual([{ functionName: "main", line: 9 }]);
    expect(out.currentLine).toBe(9);
  });

  it("run stops at breakpoints", () => {
    const source = `
int main() {
  int x = 0;
  x += 1;
  x += 2;
  cout << x << "\\n";
  return 0;
}
`;
    const session = new DebugSession(source);
    session.setBreakpoint(5);

    const paused = session.run();
    expect(paused.status).toBe("paused");
    expect(paused.pauseReason).toBe("breakpoint");
    expect(paused.currentLine).toBe(5);
    expect(paused.localVars[0]?.vars).toEqual([{ name: "x", kind: "int", value: "1" }]);

    const done = session.run();
    expect(done.status).toBe("done");
    expect(done.output.stdout).toBe("3\n");
  });

  it("stepInto advances through cin targets one by one while stepOver keeps cin as one statement", () => {
    const source = `
int main() {
  int a = 0;
  int b = 0;
  int c = 0;
  cin >> a >> b >> c;
  cout << a << b << c << "\\n";
  return 0;
}
`;
    const session = new DebugSession(source, "10 20 30");

    expect(session.stepInto().currentLine).toBe(3);
    expect(session.stepOver().currentLine).toBe(4);
    expect(session.stepOver().currentLine).toBe(5);
    expect(session.stepOver().currentLine).toBe(6);
    expect(session.getState().input).toEqual({ tokens: ["10", "20", "30"], nextIndex: 0 });

    const cinStatement = session.stepInto();
    expect(cinStatement.currentLine).toBe(6);
    expect(cinStatement.input).toEqual({ tokens: ["10", "20", "30"], nextIndex: 1 });
    expect(cinStatement.executionRange).toEqual({
      startLine: 6,
      startCol: 10,
      endLine: 6,
      endCol: 11,
      level: 2,
    });
    expect(cinStatement.localVars[0]?.vars).toEqual([
      { name: "a", kind: "int", value: "10" },
      { name: "b", kind: "int", value: "0" },
      { name: "c", kind: "int", value: "0" },
    ]);

    const afterFirstTarget = session.stepInto();
    expect(afterFirstTarget.currentLine).toBe(6);
    expect(afterFirstTarget.input).toEqual({ tokens: ["10", "20", "30"], nextIndex: 2 });
    expect(afterFirstTarget.executionRange).toEqual({
      startLine: 6,
      startCol: 15,
      endLine: 6,
      endCol: 16,
      level: 2,
    });
    expect(afterFirstTarget.localVars[0]?.vars).toEqual([
      { name: "a", kind: "int", value: "10" },
      { name: "b", kind: "int", value: "20" },
      { name: "c", kind: "int", value: "0" },
    ]);

    const afterSecondTarget = session.stepInto();
    expect(afterSecondTarget.currentLine).toBe(6);
    expect(afterSecondTarget.input).toEqual({ tokens: ["10", "20", "30"], nextIndex: 3 });
    expect(afterSecondTarget.executionRange).toEqual({
      startLine: 6,
      startCol: 20,
      endLine: 6,
      endCol: 21,
      level: 2,
    });
    expect(afterSecondTarget.localVars[0]?.vars).toEqual([
      { name: "a", kind: "int", value: "10" },
      { name: "b", kind: "int", value: "20" },
      { name: "c", kind: "int", value: "30" },
    ]);

    const nextStatement = session.stepInto();
    expect(nextStatement.currentLine).toBe(7);
  });
});
