import assert from "node:assert/strict";
import test from "node:test";

import { candidatePaths, selectTool } from "../smi-select.js";

const amd = "/usr/bin/amd-smi";
const rocm = "/usr/bin/rocm-smi";
const miss = { id: null, path: null, allowEmptyFallback: false };

test("candidatePaths lists /usr/bin then /opt/rocm/bin", () => {
  assert.deepEqual(candidatePaths("amd-smi"), [
    "/usr/bin/amd-smi",
    "/opt/rocm/bin/amd-smi",
  ]);
});

test("auto with both paths uses amd-smi and does not switch", () => {
  assert.deepEqual(selectTool("auto", { "amd-smi": amd, "rocm-smi": rocm }), {
    id: "amd-smi",
    path: amd,
    allowEmptyFallback: false,
  });
});

test("auto with only amd-smi does not allow fallback", () => {
  assert.deepEqual(selectTool("auto", { "amd-smi": amd, "rocm-smi": null }), {
    id: "amd-smi",
    path: amd,
    allowEmptyFallback: false,
  });
});

test("auto with only rocm-smi uses rocm-smi", () => {
  assert.deepEqual(selectTool("auto", { "amd-smi": null, "rocm-smi": rocm }), {
    id: "rocm-smi",
    path: rocm,
    allowEmptyFallback: false,
  });
});

test("auto with neither returns the miss object", () => {
  assert.deepEqual(selectTool("auto", { "amd-smi": null, "rocm-smi": null }), miss);
});

test("forced amd-smi ignores a present rocm-smi", () => {
  assert.deepEqual(
    selectTool("amd-smi", { "amd-smi": null, "rocm-smi": rocm }),
    miss,
  );
});

test("forced amd-smi returns its path", () => {
  assert.deepEqual(selectTool("amd-smi", { "amd-smi": amd, "rocm-smi": rocm }), {
    id: "amd-smi",
    path: amd,
    allowEmptyFallback: false,
  });
});

test("forced rocm-smi returns its path when both exist", () => {
  assert.deepEqual(selectTool("rocm-smi", { "amd-smi": amd, "rocm-smi": rocm }), {
    id: "rocm-smi",
    path: rocm,
    allowEmptyFallback: false,
  });
});

test("forced rocm-smi with neither returns the miss object", () => {
  assert.deepEqual(
    selectTool("rocm-smi", { "amd-smi": null, "rocm-smi": null }),
    miss,
  );
});

test("an unknown preference behaves as auto", () => {
  assert.deepEqual(selectTool("banana", { "amd-smi": amd, "rocm-smi": rocm }), {
    id: "amd-smi",
    path: amd,
    allowEmptyFallback: false,
  });
});
