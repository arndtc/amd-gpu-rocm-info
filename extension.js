import GLib from "gi://GLib";
import St from "gi://St";
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Gio from "gi://Gio";

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

import { formatBytes, temperatureClass } from "./format-metrics.js";
import { parseAmdSmiMetric } from "./parse-amd-smi.js";
import { parseRocmSmi, rocmArgvTails } from "./parse-rocm-smi.js";
import { candidatePaths, selectTool } from "./smi-select.js";

const GPU_MONITOR_REFRESH_SECONDS = 3;

function resolveToolPath(name) {
  const fromPath = GLib.find_program_in_path(name);
  if (fromPath) return fromPath;
  for (const candidate of candidatePaths(name)) {
    if (GLib.file_test(candidate, GLib.FileTest.IS_EXECUTABLE)) return candidate;
  }
  return null;
}

function flatten(text) {
  return String(text ?? "").replace(/\r\n|\n|\r/g, " ").slice(0, 400);
}

function isNoent(error) {
  if (!error || typeof error.matches !== "function") return false;
  try {
    if (error.matches(GLib.SpawnError, GLib.SpawnError.NOENT)) return true;
  } catch (e) {
    // SpawnError is not available in this runtime.
  }
  try {
    if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return true;
  } catch (e) {
    // IOErrorEnum is not available in this runtime.
  }
  return false;
}

function isCancelled(error) {
  if (!error || typeof error.matches !== "function") return false;
  try {
    return error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
  } catch (e) {
    return false;
  }
}

const GPUMonitorIndicator = GObject.registerClass(
  class GPUMonitorIndicator extends PanelMenu.Button {
    _init(settings) {
      super._init(0.0, "AMD GPU Monitor");
      this._settings = settings;
      this._generation = 0;
      this._cancellable = null;
      this._timeout = null;
      this._children = [];
      this._inFlight = false;
      this._extraTicks = 0;
      this._tool = { id: null, path: null, allowEmptyFallback: false };
      this._found = { "amd-smi": null, "rocm-smi": null };
      this._preference = "auto";
      this._amdFirstDone = false;
      this._nullStreak = 0;
      this._everShown = false;
      this._lastLogClass = null;
      this._destroying = false;
      this._metricBoxes = [];

      this._container = new St.BoxLayout({
        style_class: "gpu-monitor-container",
        vertical: false,
      });

      this._freqLabel = new St.Label({
        text: "--- MHz",
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "gpu-monitor-label",
      });
      this._tempLabel = new St.Label({
        text: "---°C",
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "gpu-monitor-label",
      });
      this._memLabel = new St.Label({
        text: "--- MB",
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "gpu-monitor-label",
      });

      this._addMetricWithIcon("network-transmit-receive-symbolic", this._freqLabel);
      this._addMetricWithIcon("power-profile-power-saver-symbolic-rtl", this._tempLabel);
      this._addMetricWithIcon("network-cellular-signal-good-symbolic", this._memLabel);

      this._errorLabel = new St.Label({
        text: "",
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "gpu-monitor-label",
      });
      this._errorLabel.hide();
      this._container.add_child(this._errorLabel);
      this.add_child(this._container);

      this._screenLockedId = Main.screenShield.connect("lock-screen", () => {
        this._stop();
      });
      this._screenUnlockedId = Main.screenShield.connect("unlock-screen", () => {
        this._start();
      });
    }

    _addMetricWithIcon(iconName, label) {
      const icon = new St.Icon({
        icon_name: iconName,
        style_class: "system-status-icon",
      });
      const box = new St.BoxLayout({ vertical: false });
      box.add_child(icon);
      box.add_child(label);
      this._metricBoxes.push(box);
      this._container.add_child(box);
    }

    _showError(text) {
      this._errorLabel.set_text(text);
      this._errorLabel.show();
      for (const box of this._metricBoxes) box.hide();
    }

    _showMetrics() {
      this._errorLabel.hide();
      for (const box of this._metricBoxes) box.show();
    }

    _log(reasonClass, line) {
      if (this._lastLogClass === reasonClass) return;
      this._lastLogClass = reasonClass;
      console.error(line);
    }

    _clearTimer() {
      if (this._timeout) {
        GLib.source_remove(this._timeout);
        this._timeout = null;
      }
    }

    _armTimer() {
      this._clearTimer();
      this._timeout = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        GPU_MONITOR_REFRESH_SECONDS,
        () => {
          const keepGoing = this._onTick();
          return keepGoing === false ? GLib.SOURCE_REMOVE : GLib.SOURCE_CONTINUE;
        },
      );
    }

    _showNoTool(preference) {
      let text = _("no SMI tool");
      if (preference === "amd-smi") text = _("no amd-smi");
      else if (preference === "rocm-smi") text = _("no rocm-smi");
      this._showError(text);
      const amd = this._found["amd-smi"] ?? "missing";
      const rocm = this._found["rocm-smi"] ?? "missing";
      const fallback = preference === "auto" ? "n/a" : "no";
      this._log(
        "no-tool",
        `amd-gpu-rocm-info: no tool preference=${preference} amd=${amd} rocm=${rocm} fallback=${fallback}`,
      );
      this._clearTimer();
      this._inFlight = false;
    }

    _stop() {
      this._generation += 1;
      if (this._cancellable) this._cancellable.cancel();
      for (const child of this._children) {
        try {
          child.force_exit();
        } catch (e) {
          // The child already exited.
        }
      }
      this._children = [];
      this._inFlight = false;
      this._extraTicks = 0;
      this._clearTimer();
    }

    _start() {
      if (this._destroying) return;
      this._stop();
      this._lastLogClass = null;
      this._nullStreak = 0;
      this._amdFirstDone = false;
      this._generation += 1;
      this._cancellable = new Gio.Cancellable();

      this._preference = this._settings.get_string("smi-tool");
      this._found = {
        "amd-smi": resolveToolPath("amd-smi"),
        "rocm-smi": resolveToolPath("rocm-smi"),
      };
      this._tool = selectTool(this._preference, this._found);
      if (!this._tool.path) {
        this._showNoTool(this._preference);
        return;
      }
      this._log(
        "using",
        `amd-gpu-rocm-info: using tool=${this._tool.id} path=${this._tool.path} preference=${this._preference}`,
      );
      const keep = this._spawnSample();
      if (keep !== false) this._armTimer();
    }

    _onTick() {
      if (!this._tool.path) return false;
      if (this._inFlight) {
        this._extraTicks += 1;
        if (this._extraTicks < 2) return true;
        const tool = this._tool.id;
        this._generation += 1;
        if (this._cancellable) this._cancellable.cancel();
        this._cancellable = new Gio.Cancellable();
        for (const child of this._children) {
          try {
            child.force_exit();
          } catch (e) {
            // The child already exited.
          }
        }
        this._children = [];
        this._inFlight = false;
        this._extraTicks = 0;
        this._log("exceeded", `amd-gpu-rocm-info: sample exceeded 6s tool=${tool}`);
      }
      return this._spawnSample();
    }

    _spawnSample() {
      if (!this._tool?.path || this._destroying) return false;
      this._inFlight = true;
      this._extraTicks = 0;
      const generation = this._generation;
      if (this._tool.id === "amd-smi") return this._spawnAmd(generation);
      return this._spawnRocm(generation);
    }

    _spawnOne(argv, onResult) {
      let proc;
      try {
        proc = new Gio.Subprocess({
          argv,
          flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        proc.init(this._cancellable);
      } catch (error) {
        if (isCancelled(error)) return { started: false, cancelled: true };
        return { started: false, error };
      }
      this._children.push(proc);
      proc.communicate_utf8_async(null, this._cancellable, (source, result) => {
        try {
          const [, stdout, stderr] = source.communicate_utf8_finish(result);
          const exitOk = source.get_successful();
          onResult({
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            exitOk,
            exitStatus: exitOk ? 0 : source.get_exit_status(),
            error: null,
          });
        } catch (error) {
          onResult({
            stdout: "",
            stderr: "",
            exitOk: false,
            exitStatus: 1,
            error,
          });
        }
      });
      return { started: true };
    }

    _handleSpawnError(tool, error) {
      this._inFlight = false;
      if (isCancelled(error)) return false;
      this._log(
        "spawn-failed",
        `amd-gpu-rocm-info: spawn failed tool=${tool} error=${flatten(error?.message)}`,
      );
      if (isNoent(error)) {
        if (tool === "amd-smi" && this._tool.allowEmptyFallback && !this._amdFirstDone) {
          this._amdFirstDone = true;
          this._tool = selectTool("rocm-smi", this._found);
          if (!this._tool.path) {
            this._showNoTool(this._preference);
            return false;
          }
          this._log(
            "using",
            `amd-gpu-rocm-info: using tool=rocm-smi path=${this._tool.path} preference=${this._preference}`,
          );
          return this._spawnSample();
        }
        this._showNoTool(this._preference);
        return false;
      }
      this._finishSample(
        {
          gfxClockMhz: null,
          junctionTempC: null,
          vramUsedBytes: null,
          unrecognized: false,
        },
        { exitOk: false, exitStatus: 1, stderr: error?.message ?? "", stdout: "" },
      );
      return true;
    }

    _spawnAmd(generation) {
      const outcome = this._spawnOne(
        [
          this._tool.path,
          "metric",
          "--gpu",
          "0",
          "--clock",
          "--temperature",
          "--mem-usage",
          "--json",
        ],
        (result) => {
          if (generation !== this._generation || this._destroying) return;
          this._inFlight = false;
          if (result.error) {
            if (isCancelled(result.error)) return;
            this._finishSample(
              {
                gfxClockMhz: null,
                junctionTempC: null,
                vramUsedBytes: null,
                unrecognized: true,
              },
              {
                exitOk: false,
                exitStatus: 1,
                stderr: "",
                stdout: result.error.message ?? "",
              },
            );
            return;
          }
          this._finishSample(parseAmdSmiMetric(result.stdout), result);
        },
      );
      if (!outcome.started) {
        if (outcome.cancelled) {
          this._inFlight = false;
          return false;
        }
        return this._handleSpawnError("amd-smi", outcome.error);
      }
      return true;
    }

    _spawnRocm(generation) {
      const tails = rocmArgvTails();
      const keys = ["clocks", "temp", "vram"];
      const slots = { clocks: undefined, temp: undefined, vram: undefined };
      let pending = tails.length;
      let exitOk = true;
      let exitStatus = 0;
      let stderr = "";
      let decodeError = "";

      const finishIfDone = () => {
        if (pending > 0) return;
        if (generation !== this._generation || this._destroying) return;
        this._inFlight = false;
        this._finishSample(
          parseRocmSmi({
            clocks: slots.clocks ?? "",
            temp: slots.temp ?? "",
            vram: slots.vram ?? "",
          }),
          { exitOk, exitStatus, stderr, stdout: decodeError, decodeError },
        );
      };

      for (let i = 0; i < tails.length; i++) {
        const key = keys[i];
        const outcome = this._spawnOne([this._tool.path, ...tails[i]], (result) => {
          if (generation !== this._generation || this._destroying) return;
          if (result.error) {
            if (isCancelled(result.error)) return;
            slots[key] = "";
            exitOk = false;
            decodeError += result.error.message ?? "";
          } else if (!result.exitOk) {
            slots[key] = "";
            exitOk = false;
            exitStatus = result.exitStatus;
            stderr += result.stderr;
          } else {
            slots[key] = result.stdout;
          }
          pending -= 1;
          finishIfDone();
        });
        if (!outcome.started) {
          this._generation += 1;
          for (const child of this._children) {
            try {
              child.force_exit();
            } catch (e) {
              // The child already exited.
            }
          }
          this._children = [];
          this._inFlight = false;
          if (outcome.cancelled || isCancelled(outcome.error)) return false;
          return this._handleSpawnError("rocm-smi", outcome.error);
        }
      }
      return true;
    }

    _finishSample(parsed, meta) {
      const anyNull =
        parsed.gfxClockMhz === null ||
        parsed.junctionTempC === null ||
        parsed.vramUsedBytes === null;
      const allNull =
        parsed.gfxClockMhz === null &&
        parsed.junctionTempC === null &&
        parsed.vramUsedBytes === null;

      if (
        this._tool.id === "amd-smi" &&
        !this._amdFirstDone &&
        anyNull &&
        this._tool.allowEmptyFallback
      ) {
        this._amdFirstDone = true;
        const rocmPath = this._found["rocm-smi"];
        this._log(
          "staying",
          `amd-gpu-rocm-info: amd-smi snapshot had no usable metrics; staying on rocm-smi path=${rocmPath}`,
        );
        if (parsed.unrecognized) {
          this._log(
            "unrecognized",
            `amd-gpu-rocm-info: unrecognized output tool=amd-smi stdout=${flatten(meta.stdout)}`,
          );
        }
        this._tool = selectTool("rocm-smi", this._found);
        if (!this._tool.path) {
          this._showNoTool(this._preference);
          return;
        }
        this._log(
          "using",
          `amd-gpu-rocm-info: using tool=rocm-smi path=${this._tool.path} preference=${this._preference}`,
        );
        this._spawnSample();
        return;
      }
      if (this._tool.id === "amd-smi") this._amdFirstDone = true;

      if (!allNull) {
        this._nullStreak = 0;
        this._showMetrics();
        if (parsed.gfxClockMhz !== null) {
          this._freqLabel.set_text(`${parsed.gfxClockMhz} MHz`);
          this._everShown = true;
        }
        if (parsed.junctionTempC !== null) {
          this._tempLabel.set_text(`${parsed.junctionTempC}°C`);
          this._tempLabel.style_class = `gpu-monitor-label ${temperatureClass(parsed.junctionTempC)}`;
          this._everShown = true;
        }
        if (parsed.vramUsedBytes !== null) {
          const text = formatBytes(parsed.vramUsedBytes);
          if (text !== null) {
            this._memLabel.set_text(text);
            this._everShown = true;
          }
        }
        if (!meta.exitOk && !parsed.unrecognized && !meta.decodeError) {
          this._log(
            "command-failed",
            `amd-gpu-rocm-info: command failed tool=${this._tool.id} exit=${meta.exitStatus} stderr=${flatten(meta.stderr)}`,
          );
        }
        if (meta.decodeError) {
          this._log(
            "unrecognized",
            `amd-gpu-rocm-info: unrecognized output tool=${this._tool.id} stdout=${flatten(meta.decodeError)}`,
          );
        }
        return;
      }

      this._nullStreak += 1;
      if (parsed.unrecognized || meta.decodeError) {
        this._log(
          "unrecognized",
          `amd-gpu-rocm-info: unrecognized output tool=${this._tool.id} stdout=${flatten(meta.decodeError || meta.stdout)}`,
        );
      } else if (!meta.exitOk) {
        this._log(
          "command-failed",
          `amd-gpu-rocm-info: command failed tool=${this._tool.id} exit=${meta.exitStatus} stderr=${flatten(meta.stderr)}`,
        );
      } else {
        this._log(
          "no-usable",
          `amd-gpu-rocm-info: no usable metrics tool=${this._tool.id}`,
        );
      }

      if (!this._everShown || this._nullStreak >= 3) {
        this._showError(_("SMI unreadable"));
      }
      if (this._nullStreak >= 3) {
        this._tempLabel.style_class = "gpu-monitor-label";
        this._clearTimer();
      }
    }

    destroy() {
      this._destroying = true;
      this._stop();
      if (this._screenLockedId) {
        Main.screenShield.disconnect(this._screenLockedId);
        this._screenLockedId = null;
      }
      if (this._screenUnlockedId) {
        Main.screenShield.disconnect(this._screenUnlockedId);
        this._screenUnlockedId = null;
      }
      super.destroy();
    }
  },
);

export default class AmdGpuMonitorExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._settingsId = this._settings.connect("changed::smi-tool", () => {
      if (!this._indicator) return;
      this._indicator._stop();
      this._indicator._start();
    });
    this._settings.get_string("smi-tool");
    this._indicator = new GPUMonitorIndicator(this._settings);
    Main.panel.addToStatusArea(this.uuid, this._indicator, 1, "left");
    this._indicator._start();
  }

  disable() {
    if (this._settings && this._settingsId) {
      this._settings.disconnect(this._settingsId);
      this._settingsId = null;
    }
    this._settings = null;
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }
}
