import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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
      vramUsedBytes: 100,
      unrecognized: false,
    },
  );
});

test("a temperature block without junction leaves that field null", () => {
  assert.deepEqual(
    parseRocmSmi({
      clocks: fixture("showclocks.txt"),
      temp: "GPU[0] : Temperature (Sensor edge) (C): 40.0\n",
      vram: fixture("showmeminfo-vram.txt"),
    }),
    {
      gfxClockMhz: 1500,
      junctionTempC: null,
      vramUsedBytes: 1073741824,
      unrecognized: false,
    },
  );
});

test("captured rocm-smi 7.1.1 stdout", () => {
  const dir = new URL("./fixtures/rocm-smi/captured/", import.meta.url);
  const expectedPath = new URL("expected.json", dir);
  if (!existsSync(expectedPath)) {
    throw new Error("captured rocm-smi fixture missing");
  }
  const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  const read = (name) => readFileSync(new URL(name, dir), "utf8");
  assert.deepEqual(
    parseRocmSmi({
      clocks: read("showclocks.txt"),
      temp: read("showtemp.txt"),
      vram: read("showmeminfo-vram.txt"),
    }),
    expected,
  );
});
