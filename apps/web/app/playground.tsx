"use client";

import { useState, useTransition } from "react";
import { compileAndRun } from "@clientsidecpp/index";

const starterSource = `using namespace std;

int main() {
    int n;
    cin >> n;

    vector<int> a(n);
    for (int i = 0; i < n; i++) {
        a[i] = i * i;
    }

    cout << "n=" << n << "\\n";
    cout << a.back() << "\\n";
    return 0;
}`;

const starterInput = `5`;

type ExecutionState = {
  status: "idle" | "done" | "error";
  stdout: string;
  stderr: string;
  errorMessage: string | null;
  currentLine: number | null;
  globals: Array<{ name: string; value: string; kind: string }>;
  arrays: Array<{ ref: number; values: string[]; dynamic: boolean }>;
};

const initialState: ExecutionState = {
  status: "idle",
  stdout: "",
  stderr: "",
  errorMessage: null,
  currentLine: null,
  globals: [],
  arrays: [],
};

export function Playground() {
  const [source, setSource] = useState(starterSource);
  const [input, setInput] = useState(starterInput);
  const [execution, setExecution] = useState<ExecutionState>(initialState);
  const [isPending, startTransition] = useTransition();

  const runProgram = () => {
    startTransition(() => {
      const result = compileAndRun(source, input, "playground.cpp");

      setExecution({
        status: result.status === "error" ? "error" : "done",
        stdout: result.output.stdout,
        stderr: result.output.stderr,
        errorMessage: result.error?.message ?? null,
        currentLine: result.debugInfo.currentLine,
        globals: result.debugInfo.globalVars,
        arrays: result.debugInfo.arrays.map((array) => ({
          ref: array.ref,
          values: array.values,
          dynamic: array.dynamic,
        })),
      });
    });
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">GitHub Pages / Next.js</p>
        <h1>ClientSideCPP Playground</h1>
        <p className="lede">
          `client-side-cpp` をブラウザ上でそのまま実行するための最小 UI です。GitHub Pages に静的配信できるように
          Next.js の static export で構成しています。
        </p>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-header">
            <h2>Source</h2>
            <button type="button" onClick={runProgram} disabled={isPending}>
              {isPending ? "Running..." : "Run"}
            </button>
          </div>
          <textarea
            className="editor"
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </div>

        <div className="side-column">
          <div className="panel">
            <div className="panel-header">
              <h2>Input</h2>
            </div>
            <textarea
              className="io"
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Result</h2>
              <span className={`status-pill status-${execution.status}`}>{execution.status}</span>
            </div>
            <dl className="meta">
              <div>
                <dt>Current line</dt>
                <dd>{execution.currentLine ?? "-"}</dd>
              </div>
              <div>
                <dt>Globals</dt>
                <dd>{execution.globals.length}</dd>
              </div>
              <div>
                <dt>Arrays</dt>
                <dd>{execution.arrays.length}</dd>
              </div>
            </dl>

            {execution.errorMessage ? (
              <pre className="output error-box">{execution.errorMessage}</pre>
            ) : null}

            <div className="stack">
              <div>
                <h3>stdout</h3>
                <pre className="output">{execution.stdout || "(empty)"}</pre>
              </div>
              <div>
                <h3>stderr</h3>
                <pre className="output">{execution.stderr || "(empty)"}</pre>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Debug Snapshot</h2>
            </div>
            <div className="debug-grid">
              <div>
                <h3>Global vars</h3>
                <ul className="plain-list">
                  {execution.globals.length === 0 ? (
                    <li>No globals</li>
                  ) : (
                    execution.globals.map((variable) => (
                      <li key={variable.name}>
                        <strong>{variable.name}</strong> [{variable.kind}] = {variable.value}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h3>Arrays</h3>
                <ul className="plain-list">
                  {execution.arrays.length === 0 ? (
                    <li>No arrays</li>
                  ) : (
                    execution.arrays.map((array) => (
                      <li key={array.ref}>
                        <strong>#{array.ref}</strong> {array.dynamic ? "vector" : "array"} = [
                        {array.values.join(", ")}]
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
