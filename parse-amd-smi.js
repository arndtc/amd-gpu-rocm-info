const EMPTY = {
  gfxClockMhz: null,
  junctionTempC: null,
  vramUsedBytes: null,
  unrecognized: true,
};

function asObject(value) {
  return value !== null && typeof value === "object" ? value : null;
}

function finiteUnit(node, units) {
  if (node === "N/A") return null;
  const record = asObject(node);
  if (!record) return null;
  if (typeof record.value !== "number" || !Number.isFinite(record.value)) return null;
  if (!units.includes(record.unit)) return null;
  return record.value;
}

function gpuList(root) {
  if (Array.isArray(root)) return root;
  const record = asObject(root);
  if (record && Array.isArray(record.gpu_data)) return record.gpu_data;
  return null;
}

export function parseAmdSmiMetric(stdout) {
  let root;
  try {
    root = JSON.parse(stdout);
  } catch {
    return { ...EMPTY };
  }

  const list = gpuList(root);
  if (!list) return { ...EMPTY };

  const gpu = list.find((entry) => asObject(entry)?.gpu === 0);
  if (!gpu) return { ...EMPTY };

  const clock = finiteUnit(asObject(gpu.clock)?.gfx_0?.clk, ["MHz"]);
  const temp = finiteUnit(asObject(gpu.temperature)?.hotspot, ["C", "°C"]);
  const vram = finiteUnit(asObject(gpu.mem_usage)?.used_vram, ["MB", "B"]);

  let vramUsedBytes = null;
  if (vram !== null) {
    const unit = gpu.mem_usage.used_vram.unit;
    const bytes = unit === "MB" ? vram * 1024 * 1024 : vram;
    vramUsedBytes = Math.trunc(bytes);
    if (vramUsedBytes < 0) vramUsedBytes = null;
  }

  let junctionTempC = null;
  if (temp !== null) {
    const parsed = parseInt(temp, 10);
    junctionTempC = Number.isNaN(parsed) ? null : parsed;
  }

  return {
    gfxClockMhz: clock === null ? null : Math.trunc(clock),
    junctionTempC,
    vramUsedBytes,
    unrecognized: false,
  };
}
