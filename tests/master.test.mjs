import { strict as assert } from "node:assert";
import { compile, compileAndRun } from "../dist/index.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("compile minimal main", () => {
  const source = `
int main() {
  return 0;
}
`;
  const result = compile(source);
  assert.equal(result.ok, true);
});

test("arithmetic and cout", () => {
  const source = `
int main() {
  int a = 10;
  int b = 3;
  cout << a + b << "\\n";
  cout << a / b << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "13\n3\n");
});

test("if while and function call", () => {
  const source = `
int sumTo(int n) {
  int i = 1;
  int s = 0;
  while (i <= n) {
    s += i;
    i++;
  }
  return s;
}

int main() {
  int x = sumTo(5);
  if (x == 15) {
    cout << "ok" << "\\n";
  } else {
    cout << "ng" << "\\n";
  }
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "ok\n");
});

test("cin reads integers", () => {
  const source = `
int main() {
  int a;
  int b;
  cin >> a >> b;
  cout << a * b << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source, "6 7");
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "42\n");
});

test("uninitialized read is runtime error", () => {
  const source = `
int main() {
  int x;
  cout << x << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "error");
  assert.ok(result.error?.message.includes("uninitialized"));
});
