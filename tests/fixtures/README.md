`rocm-smi/showclocks.txt`, `showtemp.txt`, and `showmeminfo-vram.txt` are synthetic stdout. They are not output from a machine.

`amd-smi/metric.json` and `amd-smi/version.txt` are mabel's stdout from `amd-smi metric --gpu 0 --clock --temperature --mem-usage --json` and `amd-smi version`. The tool line is `AMDSMI Tool: 27.1.0+7da43026 | AMDSMI Library version: 27.1.0 | ROCm version: 10.1.0`. Mabel has no `rocm-smi` binary, so this directory has no rocm-smi capture.

`rocm-smi/captured/` is harlow's stdout from `rocm-smi --showclocks`, `--showtemp`, `--showmeminfo vram`, and `rocm-smi --version`. The version file says `ROCM-SMI version: 4.0.0+unknown` and `ROCM-SMI-LIB version: 7.8.0`. `low-power.stderr` is the stderr warning from those commands. Harlow has no `amd-smi` binary, so there is no amd-smi capture from harlow.

`expected.json` beside each capture is the four-field parser result from the rules in `docs/designs/amd-smi-rocm-smi-interchange.md`.
