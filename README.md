# Fluxa-WebCP

> A step-debuggable interpreter for a competitive-programming subset of C++, written in TypeScript.

[![npm](https://img.shields.io/npm/v/fluxa-webcp.svg)](https://www.npmjs.com/package/fluxa-webcp)
[![license](https://img.shields.io/npm/l/fluxa-webcp.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/fluxa-webcp.svg)](#)

Fluxa-WebCP runs C++ source code in the browser or in Node.js, one AST node at a time.
Every variable, every stack frame, every array cell is observable at every step — and
the entire interpreter state is a plain JSON-serializable object.

It is not a C++ compiler. It is a **teaching and debugging substrate** for the
narrow slice of C++ that competitive programmers actually write.

![Playground screenshot](readme-assets/web-app-screenshot1.png)

---

## Why Fluxa-WebCP

Online judges show you a verdict. Wandbox and Compiler Explorer show you the
final stdout. Neither lets you watch a `dp` array fill in row by row, or
inspect the call stack inside a recursive `dfs`.

Fluxa-WebCP is built around three commitments:

- **Step granularity is one AST node.** Not one line — one node. You can stop
  in the middle of `a[i] = f(j) + g(k)` and inspect both subexpressions
  independently.
- **No undefined behavior, ever.** Out-of-range array access, uninitialized
  reads, null-pointer deref, integer division by zero — all become explicit,
  recoverable runtime errors with a stack trace. The interpreter never throws.
- **State is data, not a process.** `InterpreterState` is a serializable
  object. You can JSON-stringify it, diff two snapshots, persist a session,
  or send it across a worker boundary.

These properties make the same engine usable as a CLI runner, a step
debugger, a teaching tool, and a backend for time-travel debugging UIs.

---

## Install

```bash
npm install fluxa-webcp
# or
pnpm add fluxa-webcp
# or
yarn add fluxa-webcp
```

Requires Node.js 20+. Zero runtime dependencies. Ships ESM and CJS bundles
plus `.d.ts` types.

---

## Quick start

### Run a program

```typescript
import { Compiler } from "fluxa-webcp";

const source = `
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    cout << n * n << "\\n";
    return 0;
}
`;

const result = new Compiler().compile(source);
if (result.kind === "error") {
  for (const d of result.diagnostics) console.error(d.formatted);
  process.exit(1);
}

const session = result.session;
session.provideInput("7\n");
session.run();

console.log(session.state.output);  // => "49\n"
console.log(session.state.status);  // => "done"
```

### Step through a program

```typescript
const session = result.session;
session.provideInput("5\n");

while (session.state.status !== "done" && session.state.status !== "error") {
  session.stepInto();
  const info = session.debugInfo();
  console.log(`line ${info.currentLine}`, info.localVars.at(-1));
}
```

Each call to `stepInto()` advances the interpreter by one AST node and
returns control. `debugInfo()` exposes the full observable state — call
stack, scoped locals, globals, all live arrays and vectors, the input
cursor, and the source range currently being evaluated.

### Set breakpoints

```typescript
session.setBreakpoint(12);
session.run();          // pauses at line 12
console.log(session.debugInfo().pauseReason);  // => "breakpoint"
session.run();          // continues
```

---

## What's supported

A precise specification lives in [`SPECIFICATION.md`](./SPECIFICATION.md).
Briefly:

- **Types** — `int` / `long long` (both 64-bit `BigInt` internally), `double`,
  `bool`, `string`, fixed-length arrays, `vector<T>`, `pair<T,U>`,
  `tuple<T...>`, `T*`, `T&`.
- **Control flow** — `if`/`else`, `for`, range-based `for`, `while`,
  `break`, `continue`, `return`.
- **Functions** — value, reference, and pointer parameters; recursion;
  global variables.
- **I/O** — `cin`, `cout`, `cerr`, `endl`. Common `sync_with_stdio` /
  `tie` incantations are accepted as no-ops.
- **Standard library** — `abs`, `max`, `min`, `swap`, `sort` (with
  `greater<int>()`), `reverse`, `fill`, `make_pair`, `make_tuple`,
  `get<I>`.
- **Preprocessor** — `#include <bits/stdc++.h>` and `#define` only.

### Non-goals

The following are **deliberately** unsupported, and are surfaced as
compile errors rather than ignored:

- Dynamic memory: `new`, `delete`, `malloc`, `free`
- User-defined `struct`, `class`, or templates
- Function pointers, namespaces (other than `using namespace std;`)
- C-style and `static_cast` casts
- Reference return values

If you need any of these, you need a real compiler — Fluxa-WebCP will
tell you so explicitly.

### Limits

| Resource | Default | Configurable |
| --- | --- | --- |
| Recursion depth | 10,000 frames | no |
| Execution steps | 10,000,000 | yes (UI control) |

Both are enforced as graceful runtime errors, not crashes.

---

## Debugger API

The `DebugSession` returned by a successful compile exposes:

| Method | Behavior |
| --- | --- |
| `stepInto()` | Advance one AST node; descend into calls. |
| `stepOver()` | Advance one statement; treat calls as atomic. |
| `stepOut()` | Run until the current frame returns. |
| `run()` | Run until breakpoint, completion, or error. |
| `pause()` | Suspend a running session. |
| `setBreakpoint(line)` / `clearBreakpoint(line)` | Manage line breakpoints. |
| `provideInput(s)` | Append to the stdin buffer. |
| `debugInfo()` | Snapshot the full observable state. |

`session.state` is a `InterpreterState`:

```typescript
type InterpreterState = {
  callStack:   Frame[];
  globalStore: GlobalStore;
  output:      string;
  errorOutput: string;
  status:      "running" | "paused" | "done" | "error";
  error:       RuntimeError | null;
};
```

This object is plain data. `JSON.stringify(session.state)` works. Storing
snapshots, diffing them, or shipping them to another process all work
without ceremony.

---

## Errors

**Compile errors** follow GCC/Clang format, so what you learn here
transfers directly to a real toolchain:

```
main.cpp:7:14: error: 'x' was not declared in this scope
```

**Runtime errors** carry a one-frame stack trace and a structured
representation:

```
Runtime Error: index 10 out of range for array of size 5
  at dfs:23
  at main:41
```

The interpreter never throws on user-program errors. They surface
through `state.status === "error"` and `state.error`.

---

## Playground

A Next.js playground in [`apps/web/`](./apps/web/) wraps the interpreter
with a Monaco editor, gutter breakpoints, a live variables/call-stack
panel, and step controls.

```bash
pnpm install
pnpm --filter web dev    # http://localhost:3000
pnpm --filter web build  # production build
```

---

## Project layout

```
.
├── src/                    # fluxa-webcp — interpreter core (the published package)
│   ├── index.ts            # public API
│   ├── compiler.ts         # parse → validate → session
│   ├── preprocessor.ts
│   ├── parser/
│   ├── runtime/            # Value union, RuntimeError, CompileError
│   ├── interpreter/        # evaluator and execution engine
│   ├── semantic/validator.ts
│   └── debugger/session.ts
├── apps/web/               # Next.js playground
└── tests/                  # Vitest, organized by feature
```

Internal dependency rules:

- `parser` and `runtime` have no internal dependencies and no awareness
  of each other.
- `interpreter` depends on `parser` and `runtime`.
- `debugger` depends on `interpreter` and `runtime`.
- Cycles are forbidden.
- Files stay under 800 lines; oversized files are split by responsibility,
  not by line count.

---

## Development

```bash
pnpm install
pnpm test               # run all tests
pnpm test --watch
pnpm build              # build the core package via Rollup
pnpm biome check --write
```

Tests are organized by feature area in `tests/`, from `01-basics.test.ts`
through `10-pointers-and-references.test.ts`. New language features land
with their own test file.

`@ts-ignore` and `biome-ignore` are not used without an inline
justification comment.

---

## License

MIT. See [`LICENSE`](./LICENSE).