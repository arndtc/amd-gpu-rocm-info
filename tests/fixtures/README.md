The files in `rocm-smi/showclocks.txt`, `showtemp.txt`, and `showmeminfo-vram.txt` are synthetic stdout. They are not output captured from a machine.

Acceptance fixtures come from a machine with the Ubuntu packages `amd-smi` 7.2.0 and `rocm-smi` 7.1.1. Run these commands and save stdout with no added formatting:

```text
amd-smi version
amd-smi metric --gpu 0 --clock --temperature --mem-usage --json
rocm-smi --version
rocm-smi --showclocks
rocm-smi --showtemp
rocm-smi --showmeminfo vram
command -v amd-smi; command -v rocm-smi
```

Write the metric JSON to `tests/fixtures/amd-smi/metric.json`. Write `expected.json` beside it using the conversion rules in `docs/designs/amd-smi-rocm-smi-interchange.md`. Write `amd-smi version` stdout to `tests/fixtures/amd-smi/version.txt`.

Write the three rocm stdout files to `tests/fixtures/rocm-smi/captured/` as `showclocks.txt`, `showtemp.txt`, and `showmeminfo-vram.txt`, plus `expected.json` with the four parser fields and `version.txt` from `rocm-smi --version` (stderr if that command fails).

If `metric.json` does not match the parser steps in the design, update that field table before changing the parser.

These acceptance files are not in the tree until that capture is added. The acceptance tests fail closed without them.
