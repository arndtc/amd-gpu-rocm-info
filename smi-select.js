const KNOWN = new Set(["auto", "amd-smi", "rocm-smi"]);
const MISS = { id: null, path: null, allowEmptyFallback: false };

export function candidatePaths(name) {
  return [`/usr/bin/${name}`, `/opt/rocm/bin/${name}`];
}

export function selectTool(preference, found) {
  const mode = KNOWN.has(preference) ? preference : "auto";
  const amd = found["amd-smi"] ?? null;
  const rocm = found["rocm-smi"] ?? null;

  if (mode === "amd-smi") {
    return amd
      ? { id: "amd-smi", path: amd, allowEmptyFallback: false }
      : MISS;
  }
  if (mode === "rocm-smi") {
    return rocm
      ? { id: "rocm-smi", path: rocm, allowEmptyFallback: false }
      : MISS;
  }
  if (amd) {
    return { id: "amd-smi", path: amd, allowEmptyFallback: false };
  }
  if (rocm) {
    return { id: "rocm-smi", path: rocm, allowEmptyFallback: false };
  }
  return MISS;
}
