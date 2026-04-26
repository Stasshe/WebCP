import type { DebugState, ScopeView } from "@/types";

export const starterSource = `#include <bits/stdc++.h>
using namespace std;

int n, m;
bool adj[105][105];
bool visited[105];
int comp[105];
int numComp;

void dfs(int v) {
    visited[v] = true;
    comp[v] = numComp;
    for (int u = 0; u < n; u++) {
        if (adj[v][u] && !visited[u]) {
            dfs(u);
        }
    }
}

int main() {
    cin >> n >> m;
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        adj[u][v] = true;
        adj[v][u] = true;
    }

    numComp = 0;
    for (int i = 0; i < n; i++) {
        if (!visited[i]) {
            dfs(i);
            numComp++;
        }
    }

    vector<int> sizes(numComp, 0);
    for (int i = 0; i < n; i++) sizes[comp[i]]++;
    sort(sizes.begin(), sizes.end());

    cout << numComp << "\\n";
    for (int i = 0; i < numComp; i++) {
        if (i > 0) cout << " ";
        cout << sizes[i];
    }
    cout << "\\n";
    return 0;
}`;

export const starterInput = 
`7 4
0 1
1 2
3 4
5 6`;

export const storageKeys = {
  source: "clientsidecpp.playground.source",
  input: "clientsidecpp.playground.input",
} as const;

export function tokenizeInput(input: string) {
  return input
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function createInitialExecution(inputValue: string): DebugState {
  return {
    status: "ready",
    currentLine: 1,
    callStack: [],
    output: { stdout: "", stderr: "" },
    error: null,
    localVars: [],
    globalVars: [],
    arrays: [],
    watchList: [],
    input: {
      tokens: tokenizeInput(inputValue),
      nextIndex: 0,
    },
    executionRange: null,
    stepCount: 0,
    pauseReason: null,
  };
}

export function cloneState(state: DebugState): DebugState {
  return {
    ...state,
    output: { ...state.output },
    error: state.error ? { ...state.error } : null,
    callStack: state.callStack.map((f) => ({ ...f })),
    localVars: state.localVars.map((s) => ({
      ...s,
      vars: s.vars.map((v) => ({ ...v })),
    })),
    globalVars: state.globalVars.map((v) => ({ ...v })),
    arrays: state.arrays.map((a) => ({ ...a, values: [...a.values] })),
    watchList: state.watchList.map((w) => ({ ...w })),
    input: {
      tokens: [...state.input.tokens],
      nextIndex: state.input.nextIndex,
    },
    executionRange: state.executionRange ? { ...state.executionRange } : null,
  };
}

export function getScopeTitle(scope: ScopeView, index: number): string {
  if (scope.name.startsWith("scope#")) {
    return index === 0 ? "current scope" : `outer scope ${index}`;
  }
  return scope.name;
}

export function getArrayRef(value: string): number | null {
  const match = value.match(/^<(?:array|vector)#(\d+)>$/);
  return match ? Number(match[1]) : null;
}

export function readPersistedPlayground() {
  if (typeof window === "undefined") return null;

  return {
    source: window.localStorage.getItem(storageKeys.source) ?? starterSource,
    input: window.localStorage.getItem(storageKeys.input) ?? starterInput,
  };
}
