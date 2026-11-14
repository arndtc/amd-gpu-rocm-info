import assert from "node:assert/strict";
import test from "node:test";

import { formatBytes, temperatureClass } from "../format-metrics.js";

test("formatBytes boundaries", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1024 ** 3), "1 GB");
  assert.equal(formatBytes(1024 ** 4), null);
  assert.equal(formatBytes(-1), null);
  assert.equal(formatBytes(0.5), null);
});

test("temperatureClass uses strict greater-than cutoffs", () => {
  assert.equal(temperatureClass(70), "temp-normal");
  assert.equal(temperatureClass(71), "temp-warm");
  assert.equal(temperatureClass(85), "temp-warm");
  assert.equal(temperatureClass(86), "temp-high");
});
