export function formatBytes(bytes) {
  if (bytes === 0 || Number.isNaN(bytes)) return "0 B";
  if (bytes < 0 || bytes < 1) return null;

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0 || i >= sizes.length) return null;

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function temperatureClass(celsiusInteger) {
  if (celsiusInteger > 85) return "temp-high";
  if (celsiusInteger > 70) return "temp-warm";
  return "temp-normal";
}
