# Fluxa-WebCP

A TypeScript interpreter and step-debugger for a competitive-programming-oriented C++ subset.

![Playground screenshot](readme-assets/web-app-screenshot1.png)

---

## What it is

**Fluxa-WebCP** parses and executes a carefully scoped subset of C++, with a first-class step-execution API.  
The primary use case is learning and debugging competitive programming solutions — not general C++ execution.

Key design choices:

- **No undefined behavior.** Dynamic memory, raw pointer arithmetic beyond arrays, and uninitialized reads all produce explicit runtime errors.
- **Step granularity is one AST node.** Variables, call stack, and array contents are fully inspectable at every point of execution.
- **Error messages follow GCC/Clang format.** Students can transfer to a real compiler without relearning error reading.
- **All interpreter state is serializable.** Enables UI integration, time-travel debugging, and future reverse-execution.

---

## Packages

```
.
├── src/          # fluxa-webcp — interpreter core (npm package)
└── apps/web/     # Next.js playground (web app)
```

---

## Language coverage

The supported language is intentionally narrow. A full spec lives in [`SPECIFICATION.md`](./SPECIFICATION.md).

**Types:** `int` / `long long` (identical internally, 64-bit), `bool`, `string`, `T*`, `T&`, fixed-length arrays, `vector<T>`, `pair<T,U>`, `tuple<T...>`

**Control flow:** `if`/`else`, `for`, range-based `for`, `while`, `break`, `continue`, `return`

**Functions:** user-defined functions with value / reference / pointer parameters, recursion (up to 10,000 frames)

**I/O:** `cin`, `cout`, `cerr`, `endl`

**Builtins:** `abs`, `max`, `min`, `swap`, `sort` (with `greater<int>()`), `reverse`, `fill`

**Preprocessor:** `#include <bits/stdc++.h>` and `#define` only

**Not supported:** `malloc`/`new`/`free`, `struct`/`class`, templates (user-defined), function pointers, namespaces (except `using namespace std;`), C-style or `static_cast` casts, reference return values.

---

## Interpreter core (`src/`)

### Install

```bash
pnpm add fluxa-webcp
# or
npm install fluxa-webcp
```

### Basic usage

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

const compiler = new Compiler();
const result = compiler.compile(source);

if (result.kind === "error") {
  console.error(result.diagnostics);
} else {
  const session = result.session;
  session.provideInput("7\n");
  session.run();
  console.log(session.state.output); // "49\n"
}
```

### Step execution

```typescript
const session = result.session;
session.provideInput("5\n");

// Step one AST node at a time
while (session.state.status === "running" || session.state.status === "paused") {
  session.stepInto();
  const info = session.debugInfo();
  console.log(`line ${info.currentLine}`, info.localVars);
}
```

### Debugger API

| Method | Behavior |
|---|---|
| `stepInto()` | Advance one AST node; enter function calls |
| `stepOver()` | Advance one statement; execute calls without entering |
| `stepOut()` | Run to end of current function, return to caller |
| `run()` | Execute until next breakpoint or termination |
| `pause()` | Suspend execution |
| `setBreakpoint(line)` | Set a line breakpoint |
| `clearBreakpoint(line)` | Remove a line breakpoint |

### Interpreter state

All state is a plain serializable object — safe to JSON-stringify, store, or diff:

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

---

## Playground (`apps/web/`)

The web playground is a Next.js app that wraps the interpreter with a Monaco-based editor and a live debug panel.

### Features

- Syntax-highlighted C++ editor (Monaco)
- Left panel: call stack, current scope variables with live values, step counter
- Right panel: code view with current-line highlight and execution arrow
- STDIN input, STDOUT / STDERR output panes
- Step Into / Step Over / Step Out / Run / Pause controls
- Breakpoint toggle by clicking the gutter

### Run locally

```bash
pnpm install
pnpm --filter web dev
```

Open `http://localhost:3000`.

### Build

```bash
pnpm --filter web build
```

---

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+

### Setup

```bash
pnpm install
```

### Test

```bash
pnpm test          # run all tests once
pnpm test --watch  # watch mode
```

Tests live in `tests/` and use Vitest. Filenames reflect the feature area:

```
tests/
├── 01-basics.test.ts
├── 02-control-flow.test.ts
├── 03-functions.test.ts
├── 04-arrays.test.ts
├── 05-vectors.test.ts
├── 06-errors.test.ts
├── 07-edge-cases.test.ts
├── 08-debug.test.ts
├── 09-semantics-and-builtins.test.ts
└── 10-pointers-and-references.test.ts
```

### Lint / Format

```bash
pnpm biome check --write
```

No `// @ts-ignore` or `// biome-ignore` without a written justification comment.

### Build the core package

```bash
pnpm build   # Rollup → dist/
```

---

## Architecture

```
parser  ──────────────────────────────────────────►  (no deps)
runtime ──────────────────────────────────────────►  (no deps)
interpreter  ──────────────────────────────────►  parser, runtime
debugger  ────────────────────────────────────►  interpreter, runtime
index.ts  ───────────────────────────────────►  all of the above
```

Circular dependencies are forbidden. `parser` and `runtime` are mutually unaware.

### Source layout

```
src/
├── index.ts               # public API
├── compiler.ts            # parse → validate → session
├── preprocessor.ts        # #include / #define expansion
├── types.ts               # shared AST + type definitions
├── parser/
│   ├── lexer.ts
│   ├── expression.ts
│   ├── index.ts
│   └── base/              # low-level parse helpers, split by responsibility
├── runtime/
│   ├── value.ts           # Value union type
│   └── errors.ts          # RuntimeError, CompileError
├── interpreter/
│   ├── index.ts
│   ├── evaluator.ts
│   └── runtime/           # execution engine, split by responsibility
├── semantic/
│   └── validator.ts
└── debugger/
    └── session.ts         # DebugSession wrapping interpreter + breakpoints
```

Files are kept under 800 lines. When a file approaches that, it is split by _responsibility_, not line count.

---

## Error handling

**Compile errors** are returned as structured diagnostics in GCC/Clang format:

```
<file>:<line>:<col>: error: <message>
```

**Runtime errors** include a stack trace:

```
Runtime Error: index 10 out of range for array of size 5
  at dfs:23
  at main:41
```

The interpreter never throws. All error state is communicated through `InterpreterState.status` and `InterpreterState.error`.

---

## Limits

| Resource | Default | Configurable |
|---|---|---|
| Recursion depth | 10,000 frames | No |
| Execution steps | 10,000,000 | Yes (UI slider) |

Exceeding either limit raises a `Runtime Error` and halts execution gracefully.

---

## License

MIT