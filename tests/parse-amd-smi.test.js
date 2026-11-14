import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { parseAmdSmiMetric } from "../parse-amd-smi.js";

// These objects test the field table in the design. They are not an Ubuntu capture.

const gpu0 = {
  gpu: 0,
  clock: { gfx_0: { clk: { value: 1500.9, unit: "MHz" } } },
  temperature: {
    edge: { value: 30, unit: "C" },
    hotspot: { value: 46.9, unit: "C" },
  },
  mem_usage: { used_vram: { value: 2, unit: "MB" } },
};

const gpu1 = {
  gpu: 1,
  clock: { gfx_0: { clk: { value: 99, unit: "MHz" } } },
  temperature: { hotspot: { value: 11, unit: "C" } },
  mem_usage: { used_vram: { value: 9, unit: "MB" } },
};

const parsedGpu0 = {
  gfxClockMhz: 1500,
  junctionTempC: 46,
  vramUsedBytes: 2097152,
  unrecognized: false,
};

test("top-level array uses the object whose gpu is 0, not index 0", () => {
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([gpu1, gpu0])), parsedGpu0);
});

test("gpu_data envelope uses the same GPU 0 object", () => {
  assert.deepEqual(
    parseAmdSmiMetric(JSON.stringify({ gpu_data: [gpu1, gpu0] })),
    parsedGpu0,
  );
});

test("used_vram without a unit is null", () => {
  const sample = structuredClone(gpu0);
  delete sample.mem_usage.used_vram.unit;
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([sample])), {
    gfxClockMhz: 1500,
    junctionTempC: 46,
    vramUsedBytes: null,
    unrecognized: false,
  });
});

test("clk value N/A is null", () => {
  const sample = structuredClone(gpu0);
  sample.clock.gfx_0.clk = "N/A";
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([sample])), {
    gfxClockMhz: null,
    junctionTempC: 46,
    vramUsedBytes: 2097152,
    unrecognized: false,
  });
});

test("edge without hotspot does not become the temperature", () => {
  const sample = structuredClone(gpu0);
  delete sample.temperature.hotspot;
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([sample])), {
    gfxClockMhz: 1500,
    junctionTempC: null,
    vramUsedBytes: 2097152,
    unrecognized: false,
  });
});

test("a document with no gpu 0 is unrecognized", () => {
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([{ gpu: 1 }])), {
    gfxClockMhz: null,
    junctionTempC: null,
    vramUsedBytes: null,
    unrecognized: true,
  });
});

test("invalid JSON is unrecognized", () => {
  assert.deepEqual(parseAmdSmiMetric("not-json"), {
    gfxClockMhz: null,
    junctionTempC: null,
    vramUsedBytes: null,
    unrecognized: true,
  });
});

test("captured amd-smi 7.2.0 metric JSON", () => {
  const dir = new URL("./fixtures/amd-smi/", import.meta.url);
  const metric = new URL("metric.json", dir);
  const expected = new URL("expected.json", dir);
  const version = new URL("version.txt", dir);
  if (!existsSync(metric) || !existsSync(expected) || !existsSync(version)) {
    throw new Error("captured amd-smi 7.2.0 fixture missing");
  }
  assert.deepEqual(
    parseAmdSmiMetric(readFileSync(metric, "utf8")),
    JSON.parse(readFileSync(expected, "utf8")),
  );
});
