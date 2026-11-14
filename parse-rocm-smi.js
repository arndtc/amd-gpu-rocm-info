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
  return {
    gfxClockMhz: firstInt(clocks, /.*sclk.*\((\d+).*/i),
    junctionTempC: firstInt(temp, /.*jun.*: ([0-9.]+).*/i),
    vramUsedBytes: firstInt(vram, /.*Used.*: (\d+).*/i),
    unrecognized: false,
  };
}
