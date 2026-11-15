`rocm-smi/showclocks.txt`, `showtemp.txt`, and `showmeminfo-vram.txt` are synthetic stdout. They are not output from a machine.

`amd-smi/strix-halo-27.1.0/` is stdout from `amd-smi metric --gpu 0 --clock --temperature --mem-usage --json` and `amd-smi version` on a Strix Halo APU. The tool line is `AMDSMI Tool: 27.1.0+7da43026 | AMDSMI Library version: 27.1.0 | ROCm version: 10.1.0`. That capture has no `rocm-smi` output. `gfx_0` is `N/A` and the clock comes from `apu_average_gfxclk_frequency`. Hotspot is `N/A` and the temperature is edge.

`amd-smi/strix-halo-26.2.1/` and `rocm-smi/strix-halo-4.0.0/` are a later capture from the same kind of machine. amd-smi prints `AMDSMI Tool: 26.2.1+unknown`, library 26.2.1, ROCm 10.1.0. Every gfx clock is `N/A` and hotspot is `N/A`, so the panel clock is `N/A` and the temperature is edge at 39°C. rocm-smi on that capture is sclk 813 MHz, edge 39°C, and 1004412928 used bytes. These files do not replace `amd-smi/strix-halo-27.1.0/`.

`amd-smi/discrete-26.2.1/` is a discrete GPU. The tool line is `AMDSMI Tool: 26.2.1+unknown | AMDSMI Library version: 26.2.1`. `clock.gfx_0.clk` is 334 MHz and `temperature.hotspot` is 36 C. `gfx_1` through `gfx_7` clocks are `N/A`.

`rocm-smi/discrete-4.0.0/` is that discrete GPU's `rocm-smi --showclocks`, `--showtemp`, `--showmeminfo vram`, and `rocm-smi --version`. The version file says `ROCM-SMI version: 4.0.0+unknown` and `ROCM-SMI-LIB version: 7.8.0`. `low-power.stderr` is the stderr warning from those commands.

`expected.json` beside each capture is the parser result from the rules in `docs/designs/amd-smi-rocm-smi-interchange.md`.
