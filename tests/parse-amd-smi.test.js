import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  clockSource: "gfx_0",
  tempSource: "hotspot",
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
    clockSource: "gfx_0",
    tempSource: "hotspot",
    vramUsedBytes: null,
    unrecognized: false,
  });
});

test("discrete clock and hotspot win over APU fields", () => {
  const sample = structuredClone(gpu0);
  sample.clock.apu_average_gfxclk_frequency = { value: 830, unit: "MHz" };
  sample.temperature.apu_temperature_gfx = { value: 39.12, unit: "C" };
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([sample])), parsedGpu0);
});

test("N/A gfx_0 uses the APU clock and N/A hotspot uses edge", () => {
  const sample = structuredClone(gpu0);
  sample.clock.gfx_0.clk = "N/A";
  sample.temperature.hotspot = "N/A";
  sample.clock.apu_average_gfxclk_frequency = { value: 830, unit: "MHz" };
  sample.temperature.apu_temperature_gfx = { value: 39.12, unit: "C" };
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([sample])), {
    gfxClockMhz: 830,
    junctionTempC: 30,
    clockSource: "apu_average_gfxclk",
    tempSource: "edge",
    vramUsedBytes: 2097152,
    unrecognized: false,
  });
});

test("clk value N/A is null when no APU clock is present", () => {
  const sample = structuredClone(gpu0);
  sample.clock.gfx_0.clk = "N/A";
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([sample])), {
    gfxClockMhz: null,
    junctionTempC: 46,
    clockSource: null,
    tempSource: "hotspot",
    vramUsedBytes: 2097152,
    unrecognized: false,
  });
});

test("edge is the temperature when hotspot is missing", () => {
  const sample = structuredClone(gpu0);
  delete sample.temperature.hotspot;
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([sample])), {
    gfxClockMhz: 1500,
    junctionTempC: 30,
    clockSource: "gfx_0",
    tempSource: "edge",
    vramUsedBytes: 2097152,
    unrecognized: false,
  });
});

test("a document with no gpu 0 is unrecognized", () => {
  assert.deepEqual(parseAmdSmiMetric(JSON.stringify([{ gpu: 1 }])), {
    gfxClockMhz: null,
    junctionTempC: null,
    clockSource: null,
    tempSource: null,
    vramUsedBytes: null,
    unrecognized: true,
  });
});

test("invalid JSON is unrecognized", () => {
  assert.deepEqual(parseAmdSmiMetric("not-json"), {
    gfxClockMhz: null,
    junctionTempC: null,
    clockSource: null,
    tempSource: null,
    vramUsedBytes: null,
    unrecognized: true,
  });
});

test("discrete amd-smi 26.2.1 keeps gfx_0 and hotspot", () => {
  const dir = new URL("./fixtures/amd-smi/discrete-26.2.1/", import.meta.url);
  const raw = readFileSync(new URL("metric.json", dir), "utf8");
  const gpu = JSON.parse(raw).gpu_data[0];
  assert.deepEqual(gpu.clock.gfx_0.clk, { value: 334, unit: "MHz" });
  for (const name of ["gfx_1", "gfx_2", "gfx_3", "gfx_4", "gfx_5", "gfx_6", "gfx_7"]) {
    assert.equal(gpu.clock[name].clk, "N/A");
  }
  assert.deepEqual(gpu.temperature.hotspot, { value: 36, unit: "C" });
  const version = readFileSync(new URL("version.txt", dir), "utf8");
  assert.match(version, /AMDSMI Tool: 26\.2\.1\+unknown/);
  assert.match(version, /AMDSMI Library version: 26\.2\.1/);
  assert.deepEqual(
    parseAmdSmiMetric(raw),
    JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")),
  );
});

test("strix halo amd-smi 26.2.1 shows edge and no clock", () => {
  const dir = new URL("./fixtures/amd-smi/strix-halo-26.2.1/", import.meta.url);
  const version = readFileSync(new URL("version.txt", dir), "utf8");
  assert.match(version, /AMDSMI Tool: 26\.2\.1\+unknown/);
  assert.match(version, /ROCm version: 10\.1\.0/);
  const raw = readFileSync(new URL("metric.json", dir), "utf8");
  assert.equal(JSON.parse(raw).gpu_data[0].clock.apu_average_gfxclk_frequency, undefined);
  assert.deepEqual(
    parseAmdSmiMetric(raw),
    JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")),
  );
});

test("strix halo amd-smi 27.1.0 metric JSON", () => {
  const dir = new URL("./fixtures/amd-smi/strix-halo-27.1.0/", import.meta.url);
  const version = readFileSync(new URL("version.txt", dir), "utf8");
  assert.match(version, /AMDSMI Tool: 27\.1\.0\+7da43026/);
  assert.match(version, /ROCm version: 10\.1\.0/);
  assert.deepEqual(
    parseAmdSmiMetric(readFileSync(new URL("metric.json", dir), "utf8")),
    JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")),
  );
});
