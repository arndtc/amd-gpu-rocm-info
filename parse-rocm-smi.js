function firstInt(text, pattern) {
  const match = String(text ?? "").match(pattern);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

export function rocmArgvTails() {
  return [
    ["--showclocks"],
    ["--showtemp"],
    ["--showmeminfo", "vram"],
  ];
}

export function parseRocmSmi({ clocks, temp, vram }) {
  const gfxClockMhz = firstInt(clocks, /.*sclk.*\((\d+).*/i);
  let junctionTempC = firstInt(temp, /.*jun.*: ([0-9.]+).*/i);
  let tempSource = junctionTempC === null ? null : "junction";
  if (junctionTempC === null) {
    junctionTempC = firstInt(temp, /.*edge.*: ([0-9.]+).*/i);
    if (junctionTempC !== null) tempSource = "edge";
  }
  return {
    gfxClockMhz,
    junctionTempC,
    clockSource: gfxClockMhz === null ? null : "sclk",
    tempSource,
    vramUsedBytes: firstInt(vram, /.*Used.*: (\d+).*/i),
    unrecognized: false,
  };
}
