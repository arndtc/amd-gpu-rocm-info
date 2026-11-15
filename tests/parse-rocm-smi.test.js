import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseRocmSmi } from "../parse-rocm-smi.js";

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/rocm-smi/${name}`, import.meta.url), "utf8");

test("synthetic rocm-smi stdout parses the first GPU", () => {
  assert.deepEqual(
    parseRocmSmi({
      clocks: fixture("showclocks.txt"),
      temp: fixture("showtemp.txt"),
      vram: fixture("showmeminfo-vram.txt"),
    }),
    {
      gfxClockMhz: 1500,
      junctionTempC: 46,
      clockSource: "sclk",
      tempSource: "junction",
      vramUsedBytes: 1073741824,
      unrecognized: false,
    },
  );
});

test("the first GPU line wins because dot does not cross newlines", () => {
  assert.deepEqual(
    parseRocmSmi({
      clocks: "GPU[0] : sclk clock level: 1 (300Mhz)\nGPU[1] : sclk clock level: 1 (900Mhz)\n",
      temp: "GPU[0] : Temperature (Sensor junction) (C): 46.0\nGPU[1] : Temperature (Sensor junction) (C): 80.0\n",
      vram: "GPU[0] : VRAM Total Used Memory (B): 100\nGPU[1] : VRAM Total Used Memory (B): 200\n",
    }),
    {
      gfxClockMhz: 300,
      junctionTempC: 46,
      clockSource: "sclk",
      tempSource: "junction",
      vramUsedBytes: 100,
      unrecognized: false,
    },
  );
});

test("edge is used when junction is absent", () => {
  assert.deepEqual(
    parseRocmSmi({
      clocks: fixture("showclocks.txt"),
      temp: "GPU[0] : Temperature (Sensor edge) (C): 40.0\n",
      vram: fixture("showmeminfo-vram.txt"),
    }),
    {
      gfxClockMhz: 1500,
      junctionTempC: 40,
      clockSource: "sclk",
      tempSource: "edge",
      vramUsedBytes: 1073741824,
      unrecognized: false,
    },
  );
});

test("strix halo rocm-smi 4.0.0 uses sclk and edge", () => {
  const dir = new URL("./fixtures/rocm-smi/strix-halo-4.0.0/", import.meta.url);
  const read = (name) => readFileSync(new URL(name, dir), "utf8");
  const version = read("version.txt");
  assert.match(version, /ROCM-SMI version: 4\.0\.0\+unknown/);
  assert.match(version, /ROCM-SMI-LIB version: 7\.8\.0/);
  assert.deepEqual(
    parseRocmSmi({
      clocks: read("showclocks.txt"),
      temp: read("showtemp.txt"),
      vram: read("showmeminfo-vram.txt"),
    }),
    JSON.parse(read("expected.json")),
  );
});

test("discrete rocm-smi 4.0.0 stdout", () => {
  const dir = new URL("./fixtures/rocm-smi/discrete-4.0.0/", import.meta.url);
  const read = (name) => readFileSync(new URL(name, dir), "utf8");
  const version = read("version.txt");
  assert.match(version, /ROCM-SMI version: 4\.0\.0\+unknown/);
  assert.match(version, /ROCM-SMI-LIB version: 7\.8\.0/);
  const expected = JSON.parse(read("expected.json"));
  assert.deepEqual(
    parseRocmSmi({
      clocks: read("showclocks.txt"),
      temp: read("showtemp.txt"),
      vram: read("showmeminfo-vram.txt"),
    }),
    expected,
  );
});

test("discrete low-power stderr warning does not change the parse", () => {
  const dir = new URL("./fixtures/rocm-smi/discrete-4.0.0/", import.meta.url);
  const read = (name) => readFileSync(new URL(name, dir), "utf8");
  const warning = read("low-power.stderr");
  assert.match(warning, /low-power state/);
  const expected = JSON.parse(read("expected.json"));
  assert.deepEqual(
    parseRocmSmi({
      clocks: `${warning}\n${read("showclocks.txt")}`,
      temp: `${warning}\n${read("showtemp.txt")}`,
      vram: `${warning}\n${read("showmeminfo-vram.txt")}`,
    }),
    expected,
  );
});
