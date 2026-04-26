import { describe, expect, it } from "vitest";
import { compileAndRun } from "./test-helper";

const connectedComponents = `
#include <bits/stdc++.h>
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
}
`;

describe("Sample Programs - Connected Components", () => {
  it("starter sample: 7 nodes 4 edges => 3 components [2,2,3]", () => {
    const result = compileAndRun(connectedComponents, "7 4\n0 1\n1 2\n3 4\n5 6");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n2 2 3\n");
  });

  it("all nodes isolated: 4 nodes 0 edges => 4 components", () => {
    const result = compileAndRun(connectedComponents, "4 0");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("4\n1 1 1 1\n");
  });

  it("all nodes in one path: 5 nodes 4 edges => 1 component", () => {
    const result = compileAndRun(connectedComponents, "5 4\n0 1\n1 2\n2 3\n3 4");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n5\n");
  });

  it("two components of different sizes: [2,4]", () => {
    const result = compileAndRun(connectedComponents, "6 4\n0 1\n1 2\n2 3\n4 5");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2\n2 4\n");
  });

  it("single node: 1 component of size 1", () => {
    const result = compileAndRun(connectedComponents, "1 0");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n1\n");
  });

  it("fully connected star: all nodes reachable from center", () => {
    const result = compileAndRun(connectedComponents, "6 5\n0 1\n0 2\n0 3\n0 4\n0 5");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n6\n");
  });

  it("cycle graph: one component", () => {
    const result = compileAndRun(connectedComponents, "4 4\n0 1\n1 2\n2 3\n3 0");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n4\n");
  });
});
