import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const mainRuntimeSharedFiles = ["inventoryValue.ts", "cogsMetrics.ts"];

test("desktop main-runtime shared files do not import workspace TS packages directly", () => {
  for (const file of mainRuntimeSharedFiles) {
    const content = readFileSync(join(__dirname, file), "utf8");
    assert.equal(
      content.includes("@snapko/shared"),
      false,
      `${file} must stay self-contained for Electron main CJS runtime`,
    );
  }
});
