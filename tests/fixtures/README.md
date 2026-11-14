`rocm-smi/showclocks.txt`, `showtemp.txt`, and `showmeminfo-vram.txt` are synthetic stdout. They are not output from a machine.

`amd-smi/metric.json` and `amd-smi/version.txt` are mabel's stdout from `amd-smi metric --gpu 0 --clock --temperature --mem-usage --json` and `amd-smi version`. The tool line is `AMDSMI Tool: 27.1.0+7da43026 | AMDSMI Library version: 27.1.0 | ROCm version: 10.1.0`. Mabel has no `rocm-smi` binary, so this directory has no rocm-smi capture.

`amd-smi/harlow/metric.json` and `version.txt` are harlow's later stdout from `amd-smi metric --gpu 0 --clock --temperature --mem-usage --json` and `amd-smi version`. The tool line is `AMDSMI Tool: 26.2.1+unknown | AMDSMI Library version: 26.2.1`. `clock.gfx_0.clk` is 334 MHz and `temperature.hotspot` is 36 C. `gfx_1` through `gfx_7` clocks are `N/A`. This does not replace the mabel 27.1.0 files.

`rocm-smi/captured/` is harlow's stdout from `rocm-smi --showclocks`, `--showtemp`, `--showmeminfo vram`, and `rocm-smi --version`. The version file says `ROCM-SMI version: 4.0.0+unknown` and `ROCM-SMI-LIB version: 7.8.0`. `low-power.stderr` is the stderr warning from those commands.

`amd-smi/mabel-both/` and `rocm-smi/mabel-both/` are the later mabel capture. amd-smi prints `AMDSMI Tool: 26.2.1+unknown`, library 26.2.1, ROCm 10.1.0. Every gfx clock is `N/A` and hotspot is `N/A`, so the panel clock is `N/A` and the temperature is edge at 39°C. rocm-smi on that capture is sclk 813 MHz, edge 39°C, and 1004412928 used bytes. These files do not replace `amd-smi/metric.json` (mabel 27.1.0) or `amd-smi/harlow/`.

`expected.json` beside each capture is the parser result from the rules in `docs/designs/amd-smi-rocm-smi-interchange.md`.
