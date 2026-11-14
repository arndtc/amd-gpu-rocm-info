# amd-smi and rocm-smi interchangeability

*   **Author:** Cursor Agent (requested by Chris)
*   **Status:** Approved
*   **Date:** 2026-11-14

--------------------------------------------------------------------------------

## Overview

This extension shows three AMD GPU readings in the GNOME top panel: graphics clock, temperature, and VRAM used. Today those readings come only from `rocm-smi`. It runs on GNOME Shell 46 and GNOME Shell 50. The [amd-smi 7.2.0 CLI guide](https://rocm.docs.amd.com/projects/amdsmi/en/docs-7.2.0/how-to/amdsmi-cli-tool.html) says the tool "is intended to replace and deprecate the existing `rocm_smi` CLI tool". The panel should keep showing the same three readings when the machine has `amd-smi`, `rocm-smi`, both, or neither, without spawning a missing binary every 3 seconds.

The captures in `tests/fixtures/` are from the test machines, not from the Ubuntu archive versions 7.2.0 and 7.1.1 that this design was first written against. Mabel's checked-in `amd-smi` is `/usr/bin/amd-smi` with `AMDSMI Tool: 27.1.0+7da43026 | AMDSMI Library version: 27.1.0 | ROCm version: 10.1.0`, and that capture has no `rocm-smi`. Harlow's `rocm-smi` capture printed `ROCM-SMI version: 4.0.0+unknown` and `ROCM-SMI-LIB version: 7.8.0`. A later harlow capture also has `/usr/bin/amd-smi` with `AMDSMI Tool: 26.2.1+unknown | AMDSMI Library version: 26.2.1`. That discrete document is `tests/fixtures/amd-smi/harlow/`. A newer mabel document is not part of this contract.

The extension uuid stays `amd-gpu-rocm-info@black-hat`. The indicator stays at `Main.panel.addToStatusArea(uuid, indicator, 1, "left")`.

## The Problem

`extension.js` starts three `Gio.Subprocess` children every 3 seconds while the session is unlocked:

*   `rocm-smi --showclocks`
*   `rocm-smi --showtemp`
*   `rocm-smi --showmeminfo vram`

Each child parses its own stdout with a regex and writes one label. When `rocm-smi` is not on the gnome-shell `PATH`, `Gio.Subprocess.init` throws, and the `catch` logs `Error creating subprocess` on every tick, three times. The labels stay on the placeholders `--- MHz`, `---°C`, and `--- MB`, which is the same look as "still waiting".

A machine that has `amd-smi` and no `rocm-smi` gets no readings. A machine that has both still runs only `rocm-smi`. There is no setting to choose.

The official amd-smi help documents one snapshot command that can request clock, temperature, and memory usage together, with `--json`. The mabel capture of that command is the JSON contract in the parse section.

## Goals

*   With the preference at `auto`, when `rocm-smi` resolves, the first completed `amd-smi` sample must contain graphics clock, hotspot temperature, and used VRAM. If any of those is null, the extension does not paint that sample and binds `rocm-smi` for the rest of that enable. When `rocm-smi` does not resolve, a sample that has some of those numbers updates those labels and leaves the others on their placeholders. After a sample with all three numbers, later samples stay on that tool. A missing binary for the bound tool shows the short label and does not arm the timer.
*   A preferences combo and the GSettings key `smi-tool` can force `amd-smi` or `rocm-smi`. A forced tool that is missing does not switch to the other tool.
*   The panel shows graphics clock in MHz, temperature in °C with the existing colors, and VRAM used through the existing byte formatter, for whichever tool produced the numbers.
*   When the chosen binary cannot be resolved, the panel shows one short label and the journal gets one line. The 3-second timer is not armed.
*   GNOME Shell 46 and GNOME Shell 50 can enable the extension. `metadata.json` `version` becomes the integer `2`. `readme.md` describes the new behavior.
*   `rocm-smi` parsing lives in one module that a later change can delete without editing the temperature colors, the byte formatter, or the panel position.

## Non-Goals

*   Deleting `rocm-smi` support in this change. The 7.1.1 CLI help still documents `rocm-smi`. The later deletion is listed under Future Improvements.
*   Choosing among several GPUs. The reading is GPU 0, matching today's first matching line.
*   Power, fan, utilization, encoder clocks, or a sysfs / hwmon reader.
*   `amd-smi --watch` or `rocm-smi` watch loops.
*   A runtime check of the tool version. Checked-in versions are mabel amd-smi 27.1.0, harlow amd-smi 26.2.1, and harlow rocm-smi 4.0.0+unknown / library 7.8.0. Any other version is the binary that was found. Unreadable stdout takes the unrecognized-output path.
*   Collapsing the three `rocm-smi` commands into one argv. That waits on a captured combined stdout that yields the same three numbers.
*   GNOME Shell 51, a panel menu, gettext catalogs, a change to the indicator position, a change to the uuid, or a change to the upstream URL.
*   Editing `stylesheet.css`, including the unused `.gpu-monitor-icon` rules and the `.system-status-icon` rule.

## Open Questions

The implementation plan below uses the decided column. Chris can reject a row before implementation. The JSON and `rocm-smi` text questions are not decidable from this repository; the plan says what to do when the capture disagrees.

| Question | Decided for this design | Rejecting it changes |
| --- | --- | --- |
| Which tool wins when both exist? | `auto` starts on `amd-smi`. The first completed sample must have all three numbers. If any field is null, bind `rocm-smi` for the rest of that enable and do not paint the partial sample. Later samples stay on the bound tool. | The selector in `smi-select.js` and CUJ 8. |
| Where is the force control? | GSettings string `smi-tool` and an `Adw.ComboRow`. Not an environment variable. | `prefs.js` and the schema. |
| Which temperature sensor? | `rocm-smi` junction (`jun`). `amd-smi` hotspot when that value is a number. When hotspot is `"N/A"` or otherwise unusable, `temperature.apu_temperature_gfx`. Not edge, not memory. Same 70 / 85 colors. | The amd-smi field table. |
| Which directories are searched? | gnome-shell `PATH`, then `/usr/bin/<name>`, then `/opt/rocm/bin/<name>`. | `resolveToolPath` in the implementation plan. |
| Which shell versions? | `shell-version` is `["46", "50"]`. Keep `St.BoxLayout` `vertical: false`. Do not add `51`. | `metadata.json` and the box constructor. |
| What if the captured JSON differs from the public samples? | Resolved by the mabel capture, plus the Strix Halo exception. The stdout is an object whose only top-level key is `gpu_data`. `clock.gfx_0.clk` and `temperature.hotspot` are the string `"N/A"`. The panel then uses `clock.apu_average_gfxclk_frequency` (830 MHz) and `temperature.apu_temperature_gfx` (39.12°C, shown as 39). `mem_usage.used_vram` is `{value: 951, unit: "MB"}`. Do not read `temperature.edge`. | `parse-amd-smi.js` and `tests/fixtures/amd-smi/`. |

## Critical User Journeys (CUJs)

### CUJ 1: Both tools installed, amd-smi returns numbers

*   **Given**: `smi-tool` is `auto`. Both binaries resolve. `amd-smi metric --gpu 0 --clock --temperature --mem-usage --json` prints a snapshot whose graphics clock, hotspot, and used VRAM are numbers.
*   **When**: The extension enables.
*   **Then**: The journal records one line with `tool=amd-smi` and the absolute path. The panel shows MHz, °C, and a byte-formatted VRAM used. `rocm-smi` is not spawned on that enable. Samples repeat every 3 seconds, one `amd-smi` process at a time.

### CUJ 2: Only rocm-smi resolves

*   **Given**: `smi-tool` is `auto`. `amd-smi` is not found in `PATH`, `/usr/bin`, or `/opt/rocm/bin`. `rocm-smi` resolves.
*   **When**: The extension enables.
*   **Then**: The three existing `rocm-smi` commands run. The labels follow the current regex rules. `amd-smi` is not spawned.

### CUJ 3: Only amd-smi resolves

*   **Given**: `smi-tool` is `auto`. Only `amd-smi` resolves, and its snapshot has the three numbers.
*   **When**: The extension enables.
*   **Then**: The panel shows those numbers. There is no fallback spawn.

### CUJ 4: Neither binary resolves

*   **Given**: `smi-tool` is `auto`. Both lookups fail.
*   **When**: The extension enables.
*   **Then**: The three metric boxes are hidden. One label reads `no SMI tool`. The journal gets one line naming the preference and the failed lookups. `Gio.Subprocess` is not constructed. The 3-second timer is not armed. Locking and unlocking enables the extension again (see Technical Plan) and repeats this check once.

### CUJ 5: Force rocm-smi while amd-smi exists

*   **Given**: Both binaries resolve. The user sets `smi-tool` to `rocm-smi`.
*   **When**: The setting changes.
*   **Then**: Stop the current sample (`force_exit`, cancel, drop the timer), then run the same start sequence as enable: resolve both paths, `selectTool`, spawn only `rocm-smi`, and arm the 3-second timer. `amd-smi` is not spawned on later ticks of that enable.

### CUJ 6: Force a tool that is not installed

*   **Given**: `smi-tool` is `amd-smi` and that binary does not resolve. `rocm-smi` does resolve.
*   **When**: The extension enables.
*   **Then**: The label reads `no amd-smi`. `rocm-smi` is not spawned. The journal line is `amd-gpu-rocm-info: no tool preference=amd-smi amd=missing rocm=<path-or-missing> fallback=no`. The symmetric case for `rocm-smi` reads `no rocm-smi` and uses `preference=rocm-smi`. The timer is not armed.

### CUJ 7: Screen lock and unlock

*   **Given**: Monitoring is running.
*   **When**: The screen locks, then unlocks.
*   **Then**: Lock runs stop only: bump generation, cancel, `force_exit`, clear the live child list, remove the timer, disconnect nothing yet. Callbacks from that generation do not write labels or bind a tool. Unlock runs the start sequence on the same indicator: resolve, `selectTool`, spawn or show the no-tool label, arm the timer only when a tool is bound. If the shell also `disable()`s the extension on lock, `enable()` on unlock is that same start sequence on a new indicator. Either path resolves the tool again.

### CUJ 8: amd-smi runs and returns no usable metrics

*   **Given**: `smi-tool` is `auto`. Both binaries resolve. The first `amd-smi` process exits and at least one of clock, temperature, and VRAM is null. That includes all-`N/A`, a missing JSON node, and a shape the parser marks `unrecognized`.
*   **When**: That first snapshot completes.
*   **Then**: That sample is not painted. The journal line is `amd-gpu-rocm-info: amd-smi snapshot had no usable metrics; staying on rocm-smi path=%s`. If `unrecognized` is true, one additional line is `amd-gpu-rocm-info: unrecognized output tool=amd-smi stdout=%s` with stdout truncated as specified under Journal. Later ticks spawn only `rocm-smi`. They do not retry `amd-smi` until the next enable or a settings change. If there is no `rocm-smi` path, or `smi-tool` is `amd-smi`, this fallback does not happen. A partial sample then follows the panel rule: update labels for fields that are numbers, leave the others on their placeholders, and use `SMI unreadable` only when all three fields are null.

### CUJ 9: The tool runs, but the output is not usable, and there is no fallback

*   **Given**: The bound tool's sample finishes with all three fields null, and CUJ 8 does not apply.
*   **When**: The callback runs.
*   **Then**: The metric boxes stay hidden and the error label reads `SMI unreadable` when no metric label has ever shown a number, or after this is the third all-null sample in a row. Otherwise the last numbers and the temperature class stay. One journal line is written for the new reason class (`command failed`, `unrecognized output`, or `no usable metrics`), and the body is included only on that first line. The timer stays armed for the first two all-null samples. On the third in a row it is removed. The next enable tries again. A later sample with any number, before that third miss, hides `SMI unreadable`, shows the metric boxes, and resets the streak.

### CUJ 10: A sample is still running at the next tick

*   **Given**: A child from the current sample has not finished, and this is the first timer fire since it started.
*   **When**: The 3-second timer fires.
*   **Then**: No new child is spawned and nothing is logged.

### CUJ 11: A sample is still running at the second tick

*   **Given**: The same sample is still in flight at the following timer fire, about 6 seconds after it started.
*   **When**: That timer fires.
*   **Then**: `force_exit` those children, bump the generation so their callbacks do not write, clear the live list, log `amd-gpu-rocm-info: sample exceeded 6s tool=%s` once, and spawn a new sample on that tick.

## Technical Plan (Architecture)

### What the panel shows

The three labels, icons, placeholders, and accessible name stay as they are in `extension.js` today:

*   Clock label starts as `--- MHz`. A number is shown as `${gfxClockMhz} MHz` with `gfxClockMhz` already an integer (`Math.trunc` in the parser).
*   Temperature label starts as `---°C` with no space before the degree sign. A number is shown as `${junctionTempC}°C`. `junctionTempC` is the integer from `parseInt`. The class string is exactly `gpu-monitor-label temp-high` when the integer is greater than 85, `gpu-monitor-label temp-warm` when it is greater than 70, and `gpu-monitor-label temp-normal` otherwise. 70 stays normal. 85 stays warm. `NaN` is a null field and does not change the label.
*   Memory label starts as `--- MB`. `formatBytes` receives an integer byte count. The math stays the current `_formatBytes` math: base 1024, suffixes `B`, `KB`, `MB`, `GB`, one decimal then `parseFloat`, and `0` returns `0 B`. Return null instead of a string when `bytes < 0`, when `0 < bytes < 1`, or when the suffix index would pass `GB`. Do not call it for a null field. A null return leaves the memory label unchanged.

After the tool is bound, a later sample that has some numbers and some nulls updates only the numbers. Null fields leave the previous label text and the temperature class.

The error label is an `St.Label` with `style_class` `gpu-monitor-label` and `y_align` `Clutter.ActorAlign.CENTER`, a child of the existing horizontal container, hidden at init. The three icon boxes from `_addMetricWithIcon` are stored on the indicator so they can be hidden. The error label and the icon boxes are not both visible.

| Condition | Label text | Timer |
| --- | --- | --- |
| `auto`, neither path | `no SMI tool` | not armed |
| forced `amd-smi`, no path | `no amd-smi` | not armed |
| forced `rocm-smi`, no path | `no rocm-smi` | not armed |
| bound tool, all three fields null, no fallback, and no metric has ever shown a number | `SMI unreadable` | armed until the third all-null sample in a row, then removed |
| bound tool, third all-null sample in a row, no fallback | `SMI unreadable`, temperature class reset to `gpu-monitor-label` | removed |

A sample with any number hides the error label, shows the icon boxes, and resets the all-null streak. Wrap the four strings in the existing `_()` import. Do not add a `po/` directory. The label text is chosen from the preference string, not from `selectTool`'s `id` (that `id` is null when the path is missing).

### Tool selection

`smi-select.js` is pure. It does not import `gi://`.

```text
selectTool(preference, found) ->
  { id: "amd-smi" | "rocm-smi" | null,
    path: string | null,
    allowEmptyFallback: boolean }
```

The return is always that object. A miss is `{ id: null, path: null, allowEmptyFallback: false }`. `found` is `{ "amd-smi": absolutePath | null, "rocm-smi": absolutePath | null }`.

*   A `preference` other than `auto`, `amd-smi`, or `rocm-smi` is handled as `auto`.
*   `amd-smi` with a path: `{ id: "amd-smi", path, allowEmptyFallback: false }`. Without a path: the miss object.
*   `rocm-smi` with a path: `{ id: "rocm-smi", path, allowEmptyFallback: false }`. Without a path: the miss object.
*   `auto` with an amd-smi path: `{ id: "amd-smi", path, allowEmptyFallback: true }` only when the rocm-smi path is also set. If rocm-smi is null, `allowEmptyFallback` is false.
*   `auto` with only a rocm-smi path: `{ id: "rocm-smi", path, allowEmptyFallback: false }`.
*   `auto` with both null: the miss object.

`allowEmptyFallback` means the first completed amd-smi sample of this enable may bind rocm-smi. The indicator calls `selectTool("rocm-smi", found)` once for that bind. It does so when any of the three fields is null, not only when all three are null. It does not paint that partial amd-smi sample. It does not call amd-smi again until the next enable or a settings change. A generation mismatch or a destroy-in-progress returns before this bind.

### Path lookup

`extension.js` resolves each name once per enable and again when `smi-tool` changes. Not on the 3-second tick.

Order, first hit wins. `/usr/bin` is checked even though a desktop `PATH` usually contains it, because this design does not assume the session `PATH` does.

1. `GLib.find_program_in_path(name)` in `extension.js`.
2. The strings from `candidatePaths(name)`, in order: `/usr/bin/<name>`, then `/opt/rocm/bin/<name>`, each kept only when `GLib.file_test(path, GLib.FileTest.IS_EXECUTABLE)`.

Spawn `argv[0]` as that absolute path. Never pass the argv through a shell. The GSettings value is compared to the three ids and is never concatenated into a command.

### Commands

amd-smi, one process:

```text
<abs>/amd-smi metric --gpu 0 --clock --temperature --mem-usage --json
```

Do not pass `--watch`, `--watch_time`, `--iterations`, `--file`, or `--csv`. Do not call `amd-smi` with no subcommand, and do not call `amd-smi metric --json` with no metric flags. Those dump a larger document than the panel needs. The flags are the ones in the [amd-smi 7.2.0 CLI help](https://rocm.docs.amd.com/projects/amdsmi/en/docs-7.2.0/how-to/amdsmi-cli-tool.html): `-m/--mem-usage`, `-c/--clock`, `-t/--temperature`, `-g/--gpu`, `--json`.

rocm-smi, three processes, the current argv with an absolute `argv[0]`:

```text
<abs>/rocm-smi --showclocks
<abs>/rocm-smi --showtemp
<abs>/rocm-smi --showmeminfo vram
```

Do not pass `--json` to `rocm-smi` in this change. `rocm-smi` 7.1.1 does document `--json` in the [7.1.1 CLI help](https://rocm.docs.amd.com/projects/rocm_smi_lib/en/docs-7.1.1/how-to/use-python.html). Using it would replace the text the current regexes parse. That is a separate change.

### Parse contract

Both parsers return:

```text
{ gfxClockMhz: number | null,
  junctionTempC: number | null,
  vramUsedBytes: number | null,
  unrecognized: boolean }
```

`junctionTempC` is the panel temperature. For `rocm-smi` it comes from the junction line. For `amd-smi` it comes from `temperature.hotspot` when that value is usable, and otherwise from `temperature.apu_temperature_gfx`. It is not a JSON key named `junctionTempC`.

`null` means "this field is not usable". It is not zero. The string `"N/A"`, a missing node, and a non-object intermediate are null for that field and do not throw. `unrecognized` is true only for invalid JSON, a top-level shape other than an array or `{ gpu_data: array }`, or no element with `gpu === 0`. All-`N/A` on a recognized GPU 0 is `unrecognized: false` and three nulls.

`parse-rocm-smi.js` takes `{ clocks, temp, vram }` strings. A failed command passes `""` for that slot. The regex is the one in `extension.js` today. `.` does not match newline, so the first matching line wins. A constructed two-line clock string (not a machine capture) with `(300Mhz)` on the first line and `(1500Mhz)` on the second yields `300`.

*   Clock: `stdout.match(/.*sclk.*\((\d+).*/i)`, then `parseInt`. The level index outside the parentheses is not the capture. A line `sclk clock level: 1 (7Mhz)` yields `7`. No match yields null. `unrecognized` stays false.
*   Temperature: `stdout.match(/.*jun.*: ([0-9.]+).*/i)`, then `parseInt`. The current class is `/.*jun.*: ([\d|\.]+).*/i`. The new class drops the pipe character and keeps the `+`. `parseInt` of a non-numeric match is null, not `NaN` on the label. No `jun` line yields null.
*   VRAM: `stdout.match(/.*Used.*: (\d+).*/i)`, then `parseInt`, as bytes. No match yields null.

`parse-amd-smi.js` takes the single stdout string, `JSON.parse`s it, and reads GPU 0. The mabel capture of `amd-smi metric --gpu 0 --clock --temperature --mem-usage --json` is `tests/fixtures/amd-smi/metric.json`. It is a JSON object whose only top-level key is `gpu_data`. There is no top-level `memory-usage` key. `gpu_data[0]` holds `gpu`, `clock`, `temperature`, and `mem_usage`. `gpu` is the number 0.

On that capture:

*   `clock.gfx_0.clk` is the string `"N/A"`, not `{value, unit}`. `clock.apu_average_gfxclk_frequency` is `{value: 830, unit: "MHz"}`. `gfxClockMhz` is 830.
*   `temperature.hotspot` is the string `"N/A"`. `temperature.apu_temperature_gfx` is `{value: 39.12, unit: "C"}`. `junctionTempC` is `parseInt(39.12, 10)`, which is 39. `temperature.edge` is `{value: 39, unit: "C"}` and is not read.
*   `mem_usage.used_vram` is `{value: 951, unit: "MB"}`. `vramUsedBytes` is `951 * 1024 * 1024` = 997195776.

A string `"N/A"` is unusable and does not throw. A numeric `clock.gfx_0.clk` or `temperature.hotspot` is used even when the APU fields are also present. The APU fields are read only when the discrete field is missing, `"N/A"`, or not a finite number with a matching unit. Those parser results are the three readings the first-sample check uses, so a complete Strix Halo sample does not fall back to `rocm-smi`.

Harlow's discrete amd-smi capture is `tests/fixtures/amd-smi/harlow/metric.json`, from AMDSMI Tool 26.2.1+unknown, library 26.2.1. `clock.gfx_0.clk` is `{value: 334, unit: "MHz"}`, so `gfxClockMhz` is 334. `clock.gfx_1.clk` through `clock.gfx_7.clk` are the string `"N/A"` and are not read. `temperature.hotspot` is `{value: 36, unit: "C"}`, so `junctionTempC` is 36. `mem_usage.used_vram` is `{value: 3849, unit: "MB"}`, so `vramUsedBytes` is `3849 * 1024 * 1024` = 4035969024. There is no `apu_average_gfxclk_frequency` or `apu_temperature_gfx` on that document. A numeric `gfx_0.clk` and hotspot stay the fields; the Strix Halo substitutes are not used.

Harlow's `rocm-smi` stdout is under `tests/fixtures/rocm-smi/captured/`. `--showclocks` includes `sclk clock level: S: (0Mhz)`, so `gfxClockMhz` is 0. `--showtemp` includes `Temperature (Sensor junction) (C): 35.0`, so `junctionTempC` is 35. `--showmeminfo vram` includes `VRAM Total Used Memory (B): 3979702272`. Each command exited 0. stderr, not stdout, is `WARNING: AMD GPU device(s) is/are in a low-power state. Check power control/runtime_status`. The parser reads stdout. That warning line does not match the sclk, junction, or Used patterns, so a copy of it in the text does not change the three numbers.

Parser steps. A missing node or a string `"N/A"` yields null for that field and does not throw:

1. `JSON.parse`. A throw returns three nulls and `unrecognized: true`.
2. If the value is an array, search it. If it is an object and `gpu_data` is an array, search that array. Any other top-level shape returns three nulls and `unrecognized: true`. The mabel capture uses the `gpu_data` branch.
3. Select the first element in array order whose `gpu` property is the number `0`. If none, three nulls and `unrecognized: true`. Do not substitute another GPU.
4. Clock: `clock.gfx_0.clk` is usable only when `value` is a finite number and `unit` is `MHz`. Store `Math.trunc(value)`. Read `clk`, not `min_clk` or `max_clk`. The string `"N/A"` is unusable. When `clk` is unusable, use `clock.apu_average_gfxclk_frequency` with the same unit rule. If that is also unusable, the clock is null.
5. Temperature: `temperature.hotspot` is usable only when `value` is a finite number and `unit` is `C` or `°C`. Store `parseInt(value, 10)`. A `NaN` result is unusable. The string `"N/A"` is unusable. When hotspot is unusable, use `temperature.apu_temperature_gfx` with the same unit rule and `parseInt`. Do not read `edge` or `mem`.
6. VRAM: `mem_usage.used_vram` is usable only when `value` is a finite number and `unit` is `MB` or `B`. `MB` means `Math.trunc(value * 1024 * 1024)`. `B` means `Math.trunc(value)`. Any other unit, or a missing unit, is null. Do not assume MB. A negative result is null.

`unrecognized` is false when step 3 finds GPU 0, even if steps 4–6 are null. `tests/fixtures/amd-smi/version.txt` is the mabel `amd-smi version` stdout. `tests/fixtures/amd-smi/expected.json` is the four-field result of these steps on `metric.json`.

### Polling and lifetime

`_init` does not start monitoring. `enable` calls `getSettings()`, connects `changed::smi-tool`, calls `get_string('smi-tool')` so later changes emit, constructs the indicator with that settings object, then calls `start()`. `disable` disconnects the settings signal, then `destroy()`.

```text
start
  cancel the cancellable stored for the previous generation, if any
  bump generation
  allocate a new Gio.Cancellable and store it
  resolve both paths
  selectTool
  if path is null: show the no-tool label from the preference, log once, do not arm a timer, return
  log the chosen tool and path once
  spawn one sample
  arm GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, ...)

timer, only while a tool is bound
  if the current sample is in flight on its first extra tick: return SOURCE_CONTINUE
  if that same sample is still in flight on the second extra tick: CUJ 11, then spawn
  else spawn
  return SOURCE_CONTINUE

sample finished, generation still matches, not destroying
  if amd-smi and this is the first sample and any field is null and allowEmptyFallback:
    log the staying line
    selectTool("rocm-smi", found)
    spawn rocm-smi
    return
  apply numbers, or the SMI-unreadable rule in the panel table

stop
  bump generation
  cancel the stored cancellable
  force_exit each child
  clear the live child list synchronously
  GLib.source_remove the timer
```

`lock-screen` calls `stop` only. `unlock-screen` calls `start`. `changed::smi-tool` calls `stop`, then `start`. `destroy` calls `stop`, disconnects both screen-shield handlers, then `super.destroy()`.

Pass the generation's cancellable to `Gio.Subprocess.init` and to `communicate_utf8_async`. The stdin buffer stays null. A callback whose generation does not match returns immediately. It does not log, bind a tool, spawn, or change the live child list.

`GPU_MONITOR_REFRESH_SECONDS` is `3`. Remove `GPU_MONITOR_REFRESH_INTERVAL`. The timer callback returns `GLib.SOURCE_CONTINUE`. Stopping the timer is `GLib.source_remove`.

One `rocm-smi` sample starts all three processes together. The sample is in flight until each has completed or been `force_exit`'d. Each callback stores that command's stdout, or `""` when the process is non-zero, the finish call throws, or init never ran. When all three slots are filled, call `parseRocmSmi` once. One non-zero exit does not discard the other stdout strings. If `init` throws for a later argv, `force_exit` the children already started and treat the unstarted slots as `""`.

A missing executable (`GLib.SpawnError.NOENT`, or `init` throwing because the path is gone) on the first amd-smi sample with `allowEmptyFallback` still true binds rocm-smi once. Any other missing-executable error takes the no-tool label for the preference and does not arm the timer. Log `amd-gpu-rocm-info: spawn failed tool=%s error=%s`. A cancelled callback does not log.

GNOME Shell disables extensions on the lock screen when `session-modes` is unset. Unlock then calls `enable()`, which calls `start` on a new indicator. The screen-shield handlers cover a session that does not disable the extension. Do not add `session-modes`. Do not add `unlock-dialog`.

There is no timer in the no-tool state and none after the third all-null sample with no fallback. Installing a package is picked up on the next `start`. Do not poll `PATH` on a side interval.

Journal lines go through `console.error` with the sentence already substituted. Flatten `\r\n`, `\n`, and `\r` in an inserted stdout, stderr, or error to a single space, then truncate that inserted text to 400 JavaScript characters with no ellipsis. Do not truncate the line a second time. A null path is the word `missing`. Dedup key is `tool` plus reason class. The body is on the first line of a class only. A counter inside stdout does not by itself log again. Classes:

*   `amd-gpu-rocm-info: using tool=%s path=%s preference=%s`
*   `amd-gpu-rocm-info: no tool preference=%s amd=%s rocm=%s fallback=%s` where `fallback` is `no` when the preference is not `auto`, and `n/a` when it is `auto`
*   `amd-gpu-rocm-info: amd-smi snapshot had no usable metrics; staying on rocm-smi path=%s`
*   `amd-gpu-rocm-info: command failed tool=%s exit=%s stderr=%s` for a non-zero exit whose stdout still parsed as recognized
*   `amd-gpu-rocm-info: unrecognized output tool=%s stdout=%s` when `unrecognized` is true. For a UTF-8 finish error, `stdout` is the error message.
*   `amd-gpu-rocm-info: no usable metrics tool=%s` when all three fields are null and `unrecognized` is false
*   `amd-gpu-rocm-info: spawn failed tool=%s error=%s`
*   `amd-gpu-rocm-info: sample exceeded 6s tool=%s`

Do not log a successful sample. Do not log the first in-flight skip.

### Settings

Schema id `org.gnome.shell.extensions.amd-gpu-rocm-info`, path `/org/gnome/shell/extensions/amd-gpu-rocm-info/`, key `smi-tool`, type string `s`, default `'auto'`. Not a GSettings enum. `metadata.json` gains `"settings-schema": "org.gnome.shell.extensions.amd-gpu-rocm-info"`.

The schema XML has no `<choices>` element and no enum, so a stored `banana` still loads. `prefs.js` is allowed to import `gi://` (Adw, Gio, Gtk). `extension.js` is the other file allowed to import `gi://`. Export the default class extending `ExtensionPreferences` from `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js`, with `fillPreferencesWindow(window)`. The page title is `AMD GPU ROCm Info`. The page icon is `utilities-system-monitor-symbolic`. The group title is empty. One `Adw.ComboRow` titled `Monitoring tool`. The row model is `Auto`, `amd-smi`, `rocm-smi`, mapped to `auto`, `amd-smi`, `rocm-smi`. Changing the row writes the key. A key change updates the selected index. An unknown stored string displays as `Auto` and is not written back until the user changes the row. `selectTool` treats that unknown string as `auto`.

`getSettings()` is called only from `extension.js` and `prefs.js`.

The extension directory needs a compiled schema or `getSettings()` throws. The readme install steps run `glib-compile-schemas schemas` inside the extension directory. Do not add a Makefile.

### Metadata and readme

`metadata.json`:

*   `shell-version` becomes `["46", "50"]`. The [GNOME 50 porting guide](https://gjs.guide/extensions/upgrading/gnome-shell-50.html) records no `extension.js` or `metadata.json` change. The [GNOME 51 guide](https://gjs.guide/extensions/upgrading/gnome-shell-51.html) says `St` `vertical` is removed in 51 and was deprecated in 48. This change keeps `vertical: false` and does not claim 51. It also does not add 47, 48, or 49.
*   `version` becomes the number `2`.
*   `description` becomes `Show AMD GPU clock, temperature, and VRAM with amd-smi, falling back to rocm-smi.`
*   `uuid`, `url`, `name`, and the `_generated` line stay.

`readme.md` in the same change: say which commands run, that `auto` prefers `amd-smi`, how to set `smi-tool`, the four panel failure strings, the 3-second interval, the lock stop, the left-panel index, the 70 and 85 thresholds, and the schema compile command. Say that `rocm-smi` remains supported until a later removal. Do not describe `amd-smi` JSON keys as verified. Point at this design for the field table and at `tests/fixtures/` for the capture.

### Data flow

```text
smi-tool (GSettings)
        |
        v
resolve paths --once per enable or key change--> selectTool
        |
        +-- no path --> label, one journal line, no timer
        |
        v
one sample (1 amd-smi process, or 3 rocm-smi processes)
        |
        v
pure parser --> { gfxClockMhz, junctionTempC, vramUsedBytes, unrecognized }
        |
        +-- first amd-smi sample, any field null, allowEmptyFallback --> bind rocm-smi once
        |
        v
format-metrics.js --> label text and temp class
        |
        v
indicator, if generation still matches
```

## Alternatives Considered

### Alternative A: Environment variable

*   **Pros**: No schema and no prefs file.
*   **Cons**: The gnome-shell process does not inherit variables exported in a terminal after login.
*   **Reason for Rejection**: the setting would appear to work from a shell and would not affect the panel.

### Alternative B: Boolean force switch

*   **Pros**: One widget.
*   **Cons**: Auto, amd-smi, and rocm-smi are three states. Two switches can both be on.
*   **Reason for Rejection**: a combo matches the three states.

### Alternative C: GSettings enum

*   **Pros**: Invalid values are rejected by GSettings.
*   **Cons**: Removing `rocm-smi` later changes the schema type and strands the stored value.
*   **Reason for Rejection**: a string key plus `selectTool` treats an unknown value as `auto` and survives that deletion.

### Alternative D: Prefer rocm-smi whenever it is on PATH

*   **Pros**: Existing machines keep today's numbers until someone opts in to amd-smi.
*   **Cons**: The requested outcome is that amd-smi is the tool when the first sample has all three readings. An opt-in default leaves those machines on `rocm-smi`.
*   **Reason for Rejection**: `auto` prefers amd-smi, and CUJ 8 covers the case where amd-smi's snapshot has no usable numbers. The journal line makes that fallback visible.

### Alternative E: One shared parser

*   **Pros**: One file.
*   **Cons**: The grammars differ. Deleting rocm-smi regexes would edit the amd-smi path.
*   **Reason for Rejection**: each tool owns its argv and its parse function. The indicator sees only numbers.

### Alternative F: sysfs / hwmon

*   **Pros**: No ROCm package and no JSON.
*   **Cons**: Different files, units, and permissions from the two CLIs this change is about. It does not answer which CLI is installed.
*   **Reason for Rejection**: out of scope for this change.

### Alternative G: Combined rocm-smi argv, or rocm-smi --json

*   **Pros**: One process instead of three.
*   **Cons**: Harlow's captured text already parses with the three current commands. `--json` is a different document. Combining the flags was not part of that capture.
*   **Reason for Rejection**: a later change can switch argv in the rocm module after a fixture shows the same three numbers.

### Alternative H: amd-smi human-readable text instead of JSON

*   **Pros**: The 7.1 changelog already shows `GFX_0`, `HOTSPOT`, and `USED_VRAM` as text labels.
*   **Cons**: The 7.2.0 help presents `--json` as the structured format and does not publish a text grammar. Text and JSON would both be hypotheses.
*   **Reason for Rejection**: one hypothesis, the JSON field table, locked by a capture of the filtered command. A second text parser is not added beside it.

### Alternative I: amd-smi --watch for the whole enable

*   **Pros**: One process start instead of one process every 3 seconds.
*   **Cons**: The 7.2.0 help does not show how a `--json` watch stream is framed. A resident process keeps querying if `force_exit` is missed on lock. A dead watch needs a restart path.
*   **Reason for Rejection**: each sample is one shot of the filtered command. CUJ 11 kills a sample that is still running at 6 seconds.

### Alternative J: Retry lookup every 3 seconds when nothing is installed

*   **Pros**: Installing the package updates the panel without a re-enable.
*   **Cons**: That is the spawn loop this change removes, even if the lookup itself does not exec.
*   **Reason for Rejection**: the next enable, including unlock, looks again.

--------------------------------------------------------------------------------

## Non-Functional Requirements

### Performance

A bound `amd-smi` starts one process every 3 seconds, using the three metric flags so the process prints only those groups. A bound `rocm-smi` starts the same three processes as today. The first timer fire while a sample is in flight does not start another. The second such fire is CUJ 11. The no-tool state, and the state after the third all-null sample with no fallback, start no processes and arm no timer.

### Privacy and security

The commands take no user text. The GSettings string is not interpolated into a shell. Stdout, stderr, and error text copied into the journal are truncated to 400 characters as specified under Journal.

### Rollout

There is no stored setting today. The default `auto` is the new behavior. Disable the extension to stop it. Setting `smi-tool` to `rocm-smi` returns a machine that has both tools to the current commands. Integer `version` moves from 1 to 2 and is not decreased later. The uuid stays, so the install replaces the same extension directory.

### Risks and mitigations

*   **Wrong VRAM scale.** Public samples label used VRAM as `MB`. Passing that number through `formatBytes` as bytes divides the displayed size by 1024². Mitigation: multiply only when `unit` is `MB`, by 1024², then `Math.trunc`. A missing unit is null. `expected.json` is the check.
*   **Hotspot is not the junction number.** The panel does not print the sensor name. The 70 and 85 classes follow the amd-smi temperature the parser returns (hotspot, or `apu_temperature_gfx` when hotspot is unusable) and the rocm-smi junction. Edge is not a stand-in. The accessible name stays `AMD GPU Monitor`.
*   **JSON envelope on mabel.** The capture is a `gpu_data` object. `clock.gfx_0.clk` and `temperature.hotspot` are `"N/A"`. The panel uses `apu_average_gfxclk_frequency` (830 MHz) and `apu_temperature_gfx` (39.12°C, shown as 39). `temperature.edge` is not read. A wedged sample is CUJ 11. Three all-null samples with no fallback remove the timer.
*   **gnome-shell PATH omits `/opt/rocm/bin`.** A terminal can find the tool while the extension reports it missing. Mitigation: the two absolute directories above.
*   **Late callback after destroy or after a tool switch.** Mitigation: generation plus `Gio.Cancellable` plus `force_exit`.
*   **Schema not compiled.** `getSettings()` throws and the extension fails enable. Mitigation: the readme's `glib-compile-schemas schemas` step. A throw during enable is logged once by the shell; the extension does not loop.
*   **Frozen temperature.** After a good sample, one or two all-null samples keep the last numbers and the temperature class. The third removes the timer and shows `SMI unreadable` with class `gpu-monitor-label` only.

--------------------------------------------------------------------------------

### Additional Resources

*   [amd-smi CLI help, ROCm docs 7.2.0](https://rocm.docs.amd.com/projects/amdsmi/en/docs-7.2.0/how-to/amdsmi-cli-tool.html)
*   [rocm-smi CLI help, ROCm docs 7.1.1](https://rocm.docs.amd.com/projects/rocm_smi_lib/en/docs-7.1.1/how-to/use-python.html)
*   [GNOME Shell 50 porting notes](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
*   [GNOME Shell 51 porting notes](https://gjs.guide/extensions/upgrading/gnome-shell-51.html) (vertical removed; this design does not target 51)
*   [ROCm 7.1 amd-smi changelog](https://github.com/ROCm/amdsmi/blob/release/rocm-rel-7.1/CHANGELOG.md) (human-readable metric names, not JSON)
*   [Beszel issue 737](https://github.com/henrygd/beszel/issues/737) (public `amd-smi metric --json` paste, version not stated)
*   [amdsmi issue 134](https://github.com/ROCm/amdsmi/issues/134) (`gpu_data` envelope on ROCm 7.0.2)
*   Current extension: `extension.js`, `metadata.json`, `readme.md`, `stylesheet.css`

### Future Improvements

*   **Drop rocm-smi.** When this fork stops calling it, delete `parse-rocm-smi.js`, `tests/parse-rocm-smi.test.js`, `tests/fixtures/rocm-smi/`, and the `rocm-smi` row in the combo and in `selectTool`. Leave the schema key as a string. An old dconf value `rocm-smi` then behaves as `auto`. The indicator, colors, formatter, and panel position stay.
*   **One rocm-smi process.** After a captured combined stdout yields the same three regex captures as the three commands, change the argv inside `parse-rocm-smi.js`'s companion command list only.
*   **GNOME 51.** Replace `vertical: false` with `orientation: Clutter.Orientation.HORIZONTAL` and add `"51"` to `shell-version`. Horizontal is already the widget default, so the property can also be omitted. Do that in a change that drops `"46"` or branches the constructor. Not in this change.
*   **GPU index.** The parsers hardcode GPU 0 or the first matching line. `selectTool` does not take a device. A later key can pass an index into the amd-smi argv and the JSON `gpu` match. Do not add the key now.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

One phase. Land every file in this list in the same change, after Chris accepts this document. `extension.js` must not import a module that is not part of that change. The design commit itself contains only this file.

The acceptance fixtures are the mabel amd-smi capture and the harlow rocm-smi capture described in the parse contract. Mabel has no rocm-smi output. Harlow has no amd-smi output.

### Target Files to Create/Modify

#### 1. `extension.js` (Modify)

*   **Type / Scope**: GNOME Shell extension. This file and `prefs.js` are the only files that import `gi://`.
*   **Proposed Changes**: Keep the indicator class, the three labels, the icon names, the accessible name `"AMD GPU Monitor"`, and `addToStatusArea(this.uuid, this._indicator, 1, "left")`. Replace `_onLockScreen` so it only calls `stop`. Replace `_onUnlockScreen` so it calls `start`. Do not start monitoring from `_init`. `enable` does the settings connect, `get_string('smi-tool')`, `new GPUMonitorIndicator(settings)`, and `start`, as in Polling and lifetime. `destroy` calls `stop`, disconnects both screen-shield handler ids, then `super.destroy()`. Move `_formatBytes` and the temperature class choice out to `format-metrics.js`. Delete `_updateGPUInfo`'s three inline regex spawns. Add the error label and store the three icon boxes. Add the generation, the cancellable, and the live `Gio.Subprocess` list. Construct subprocesses with `STDOUT_PIPE | STDERR_PIPE`. Pass the cancellable to `init` and to `communicate_utf8_async`. A UTF-8 finish error uses the `unrecognized output` journal line with the error message as `stdout`. A cancelled finish does not log.

#### 2. `smi-select.js` (Create)

*   **Type / Scope**: Pure ESM. No `gi://` import.
*   **Proposed Changes**: Export `selectTool(preference, found)` with the behavior in Technical Plan. Export `candidatePaths(name)` returning `["/usr/bin/" + name, "/opt/rocm/bin/" + name]` in that order. `GLib.find_program_in_path` stays in `extension.js` and runs before that list.

#### 3. `parse-amd-smi.js` (Create)

*   **Type / Scope**: Pure ESM.
*   **Proposed Changes**: Export `parseAmdSmiMetric(stdout)` implementing the six parser steps. Return `{ gfxClockMhz, junctionTempC, vramUsedBytes, unrecognized }`. Export nothing that formats a label.

#### 4. `parse-rocm-smi.js` (Create)

*   **Type / Scope**: Pure ESM.
*   **Proposed Changes**: Export `parseRocmSmi({ clocks, temp, vram })` implementing the regex rules above. Export `rocmArgvTails()` returning `[["--showclocks"], ["--showtemp"], ["--showmeminfo", "vram"]]` so the extension does not hard-code a second copy. The extension prepends the absolute path.

#### 5. `format-metrics.js` (Create)

*   **Type / Scope**: Pure ESM.
*   **Proposed Changes**: Export `formatBytes(bytes)`. `0` and `NaN` return `0 B`, matching `extension.js` today. Return null for `bytes < 0`, for `0 < bytes < 1`, and for a suffix index past `GB`. `formatBytes(1024 ** 3)` is `1 GB`. `formatBytes(1024 ** 4)` is null. Export `temperatureClass(celsiusInteger)` returning only `temp-normal`, `temp-warm`, or `temp-high`. The extension assigns `gpu-monitor-label temp-normal`, `gpu-monitor-label temp-warm`, or `gpu-monitor-label temp-high`, including the space.

#### 6. `prefs.js` (Create)

*   **Type / Scope**: Extension preferences.
*   **Proposed Changes**: The Adw combo described under Settings. No other rows.

#### 7. `schemas/org.gnome.shell.extensions.amd-gpu-rocm-info.gschema.xml` (Create)

*   **Type / Scope**: GSettings schema.
*   **Proposed Changes**: The schema id, path, and `smi-tool` key described under Settings. Description text states that values other than `auto`, `amd-smi`, and `rocm-smi` are treated as `auto`.

#### 8. `metadata.json` (Modify)

*   **Type / Scope**: Extension metadata.
*   **Proposed Changes**: The version, shell-version, description, and `settings-schema` edits under Metadata and readme. Leave uuid, url, name, and `_generated` as they are.

#### 9. `readme.md` (Modify)

*   **Type / Scope**: User-facing readme.
*   **Proposed Changes**: Replace the numbered list so it no longer says the extension only runs `rocm-smi` or that the indicator is in the system status area. Keep the screenshot. State: left panel, index 1; commands from this document; `auto` prefers amd-smi on a complete first sample; the `Monitoring tool` combo; the stored key `smi-tool`; the four panel strings; the 3-second interval; lock calls stop; thresholds 70 and 85; hotspot versus junction; `rocm-smi` stays until a later removal. Install steps, in order: copy the extension directory to `~/.local/share/gnome-shell/extensions/amd-gpu-rocm-info@black-hat`, run `glib-compile-schemas schemas` in that directory, then enable the extension. Do not describe the JSON keys as verified. Point at this design and at `tests/fixtures/`.

#### 10. `package.json` (Create)

*   **Type / Scope**: Node test hook only. No dependencies.
*   **Proposed Changes**: `{"name":"amd-gpu-rocm-info","private":true,"type":"module"}`. GJS does not read this file. Node needs `"type": "module"` so the test runner can import the ESM `.js` parsers. Do not add a test library.

#### 11. `tests/smi-select.test.js` (Create)

*   **Type / Scope**: `node:test`.
*   **Proposed Changes**: Every case asserts `id`, `path`, and `allowEmptyFallback`. Use paths `/usr/bin/amd-smi` and `/usr/bin/rocm-smi` as the found values. Cases: auto with both returns amd-smi, that path, true; auto with only amd-smi returns amd-smi, that path, false; auto with only rocm-smi returns rocm-smi, that path, false; auto with neither returns the miss object; forced amd-smi with only rocm-smi returns the miss object; forced amd-smi with its path returns amd-smi, that path, false; forced rocm-smi with both returns rocm-smi, that path, false; forced rocm-smi with neither returns the miss object; preference `banana` with both paths behaves as auto with both. Also assert `candidatePaths("amd-smi")` deep-equals `["/usr/bin/amd-smi", "/opt/rocm/bin/amd-smi"]`. No `child_process` and no `gi://`.

#### 12. `tests/parse-rocm-smi.test.js` (Create)

*   **Type / Scope**: `node:test`.
*   **Proposed Changes**: One case reads the three synthetic files below and expects `gfxClockMhz` 1500, `junctionTempC` 46, `vramUsedBytes` 1073741824, `unrecognized` false. One case uses this clocks string and expects 300, not 900: `GPU[0] : sclk clock level: 1 (300Mhz)\nGPU[1] : sclk clock level: 1 (900Mhz)\n`. The matching temp string has junction `46.0` on GPU 0 and `80.0` on GPU 1. The matching vram string has used `100` on GPU 0 and `200` on GPU 1. Expected triple is 300, 46, 100. One case with clocks and vram from the synthetic files and a temp stdout of `GPU[0] : Temperature (Sensor edge) (C): 40.0\n` expects `junctionTempC` null, clock 1500, and bytes 1073741824. The acceptance case always runs. If `tests/fixtures/rocm-smi/captured/expected.json` is missing, it fails with `captured rocm-smi fixture missing`. If present, `parseRocmSmi` equals that JSON, which has the four result fields.

#### 13. `tests/fixtures/rocm-smi/showclocks.txt` (Create)

*   **Type / Scope**: Synthetic stdout, not a machine capture.
*   **Proposed Changes**: Contents are a single trailing-newline file:

```text
GPU[0]		: sclk clock level: 1 (1500Mhz)
GPU[0]		: mclk clock level: 0 (96Mhz)
```

#### 14. `tests/fixtures/rocm-smi/showtemp.txt` (Create)

*   **Type / Scope**: Synthetic stdout.
*   **Proposed Changes**:

```text
GPU[0]		: Temperature (Sensor edge) (C): 40.0
GPU[0]		: Temperature (Sensor junction) (C): 46.9
GPU[0]		: Temperature (Sensor memory) (C): 42.0
```

Expected integer is 46 because of `parseInt`. Edge and memory must not win.

#### 15. `tests/fixtures/rocm-smi/showmeminfo-vram.txt` (Create)

*   **Type / Scope**: Synthetic stdout.
*   **Proposed Changes**:

```text
GPU[0]		: VRAM Total Memory (B): 17163091968
GPU[0]		: VRAM Total Used Memory (B): 1073741824
```

#### 16. `tests/parse-amd-smi.test.js` (Create)

*   **Type / Scope**: `node:test`.
*   **Proposed Changes**: Comment that these objects test the field table and are not an Ubuntu capture. GPU 0 object: `{"gpu":0,"clock":{"gfx_0":{"clk":{"value":1500.9,"unit":"MHz"}}},"temperature":{"edge":{"value":30,"unit":"C"},"hotspot":{"value":46.9,"unit":"C"}},"mem_usage":{"used_vram":{"value":2,"unit":"MB"}}}`. GPU 1 uses clock 99, hotspot 11, used_vram 9. The top-level array is `[gpu1, gpu0]` so GPU 0 is not index 0. Expected: `gfxClockMhz` 1500, `junctionTempC` 46, `vramUsedBytes` 2097152, `unrecognized` false. The same two objects under `{"gpu_data":[gpu1, gpu0]}` expect the same. `used_vram` with no `unit` yields `vramUsedBytes` null and the other two numbers set. `clk` value `"N/A"` yields `gfxClockMhz` null. `temperature` with only `edge` yields `junctionTempC` null. `{"gpu":1}` only yields three nulls and `unrecognized` true. The string `not-json` does the same. A separate acceptance case reads `metric.json`, `expected.json`, and `version.txt`. If any is missing, it fails with `captured amd-smi 7.2.0 fixture missing`. `expected.json` is `{ "gfxClockMhz": <integer>, "junctionTempC": <integer>, "vramUsedBytes": <integer>, "unrecognized": false }` written by the person who captured the file, using this document's conversion rules, not by copying the parser's output. `vramUsedBytes` is the truncated byte count.

#### 17. `tests/format-metrics.test.js` (Create)

*   **Type / Scope**: `node:test`.
*   **Proposed Changes**: `formatBytes(0)` is `0 B`; `formatBytes(1024)` is `1 KB`; `formatBytes(1024 ** 3)` is `1 GB`; `formatBytes(1024 ** 4)` is null; `formatBytes(-1)` is null; `formatBytes(0.5)` is null. `temperatureClass(70)` is `temp-normal`; `temperatureClass(71)` is `temp-warm`; `temperatureClass(85)` is `temp-warm`; `temperatureClass(86)` is `temp-high`.

#### 18. `tests/fixtures/README.md` (Create)

*   **Type / Scope**: Capture instructions for the acceptance fixtures.
*   **Proposed Changes**: State that the synthetic rocm files are not machine output. After this design is accepted, run these commands on a machine with Ubuntu packages `amd-smi` 7.2.0 and `rocm-smi` 7.1.1. Save stdout with no added formatting.

```text
amd-smi version
amd-smi metric --gpu 0 --clock --temperature --mem-usage --json
rocm-smi --version
rocm-smi --showclocks
rocm-smi --showtemp
rocm-smi --showmeminfo vram
command -v amd-smi; command -v rocm-smi
```

Write the metric JSON to `tests/fixtures/amd-smi/metric.json`. Write `expected.json` beside it using the conversion rules in this document. Write `amd-smi version` stdout to `tests/fixtures/amd-smi/version.txt`. Write the three rocm stdout files to `tests/fixtures/rocm-smi/captured/` as `showclocks.txt`, `showtemp.txt`, and `showmeminfo-vram.txt`, plus `expected.json` with the four parser fields and `version.txt` from `rocm-smi --version` (stderr if that command fails). If `metric.json` does not match the parser steps, update this design's field table before changing the parser.

#### 19. `.gitignore` (Modify)

*   **Type / Scope**: Git ignore list.
*   **Proposed Changes**: Add the line `schemas/gschemas.compiled`. `glib-compile-schemas` writes that file. Do not commit it.

### Verification Plan

*   **Compilation/Build**: `glib-compile-schemas schemas` in the extension directory. No other build.
*   **Unit Tests**: `node --test tests/*.test.js` from the repo root. The acceptance cases fail until the captured files exist. That failure is expected before capture and is not a reason to delete the cases.
*   **Static Analysis & Linting**: No new linter. The repo has none.
*   **Test Coverage Requirement**: Every `selectTool` branch, the rocm regex cases above, the amd-smi field-table cases above, and the temperature boundaries. No coverage percentage.
*   **E2E/Integration**: On GNOME Shell 50, after the install steps in the readme: enable and confirm CUJ 1 or CUJ 2 against the live tool. For CUJ 4, set `smi-tool` to `auto` with both binaries absent from `PATH`, `/usr/bin`, and `/opt/rocm/bin`. Expect the label `no SMI tool`, one `no tool` journal line, and no further `amd-gpu-rocm-info` journal line over the next 9 seconds. Then set `smi-tool` to `amd-smi` while that binary is absent and `rocm-smi` is present, and expect `no amd-smi` and `fallback=no`. Exercise CUJ 5, CUJ 7, CUJ 8 or CUJ 9 (whichever the machine produces), and a hung binary for CUJ 11 if one can be staged. Shell 46 stays in `shell-version` because `vertical: false` still constructs there and this change adds no Shell 50-only API. A Shell 46 enable is required only when a Shell 46 host is available. This design does not run that check.

### Files not to edit

`stylesheet.css`, `.editorconfig`, `assets/screen.jpg`, and the extension uuid. Do not add a dependency. Do not add `session-modes`.

--------------------------------------------------------------------------------

*Drafted with EGM*
