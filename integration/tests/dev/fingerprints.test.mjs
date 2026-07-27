import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  hashFiles,
  needsRefresh,
  readStamp,
  writeStamp,
} from "../../../integration/dev/fingerprints.mjs";

test("hashFiles is stable and changes with file content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lumora-fingerprint-"));
  const first = path.join(root, "a.txt");
  const second = path.join(root, "b.txt");
  await writeFile(first, "alpha");
  await writeFile(second, "beta");
  const before = await hashFiles([second, first]);
  const repeated = await hashFiles([first, second]);
  await writeFile(second, "changed");
  const after = await hashFiles([first, second]);
  assert.equal(before, repeated);
  assert.notEqual(before, after);
});

test("needsRefresh requires matching stamp and existing outputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lumora-stamp-"));
  const stampPath = path.join(root, "requirements.sha256");
  const output = path.join(root, "python.exe");
  assert.equal(
    await needsRefresh({ fingerprint: "abc", stampPath, outputs: [output] }),
    true,
  );
  await writeFile(output, "");
  await writeStamp(stampPath, "abc");
  assert.equal(await readStamp(stampPath), "abc");
  assert.equal(
    await needsRefresh({ fingerprint: "abc", stampPath, outputs: [output] }),
    false,
  );
});
