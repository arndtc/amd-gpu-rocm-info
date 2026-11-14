This GNOME Shell extension shows AMD GPU graphics clock, temperature, and VRAM used in the top panel, on the left at index 1.

The indicator reads one tool:

- `auto` (the default) uses `amd-smi` when the first sample has a graphics clock, a hotspot temperature, and used VRAM. If any of those is missing and `rocm-smi` is installed, that sample is not shown and the extension uses `rocm-smi` until it is enabled again.
- `amd-smi` and `rocm-smi` force that tool. A forced tool that is not installed does not switch to the other one.

Commands, with the absolute path of the binary that was found:

- `amd-smi metric --gpu 0 --clock --temperature --mem-usage --json`
- `rocm-smi --showclocks`
- `rocm-smi --showtemp`
- `rocm-smi --showmeminfo vram`

The panel shows the graphics clock in MHz, temperature in °C, and VRAM used. For `amd-smi`, temperature is the hotspot sensor. For `rocm-smi`, temperature is the junction sensor. Above 70°C the temperature is warm. Above 85°C it is high. 70 and 85 stay on the cooler side of those lines.

Strix Halo reports `clock.gfx_0.clk` and `temperature.hotspot` as `N/A`. The panel then uses the APU average gfx clock (`clock.apu_average_gfxclk_frequency`) and the APU gfx temperature (`temperature.apu_temperature_gfx`). Discrete numbers are kept when they are real.

Samples run every 3 seconds while the screen is unlocked and a tool is bound. Locking the screen stops them. If the chosen binary cannot be found, the panel shows one of `no SMI tool`, `no amd-smi`, or `no rocm-smi`, and it does not keep launching a process. If a bound tool returns no numbers and there is nothing to fall back to, the panel shows `SMI unreadable`.

Lookup order for each name is the session `PATH`, then `/usr/bin/<name>`, then `/opt/rocm/bin/<name>`.

Set the tool from the extension preferences (`Monitoring tool`). The stored GSettings key is `smi-tool` in `org.gnome.shell.extensions.amd-gpu-rocm-info`, with values `auto`, `amd-smi`, and `rocm-smi`. `rocm-smi` stays supported until a later removal.

The `amd-smi` JSON contract includes the mabel capture in `tests/fixtures/amd-smi/` (AMDSMI Tool 27.1.0+7da43026, library 27.1.0, ROCm 10.1.0) and the harlow discrete capture in `tests/fixtures/amd-smi/harlow/` (AMDSMI Tool 26.2.1+unknown, library 26.2.1). Harlow's `rocm-smi` capture is in `tests/fixtures/rocm-smi/captured/` (ROCM-SMI 4.0.0+unknown, library 7.8.0). Field rules are in [the design](docs/designs/amd-smi-rocm-smi-interchange.md).

Install from a checkout:

1. Copy this directory to `~/.local/share/gnome-shell/extensions/amd-gpu-rocm-info@black-hat`.
2. Run `glib-compile-schemas schemas` in that directory.
3. Enable the extension and start a new session if the shell does not pick it up.

![screen](./assets/screen.jpg)
