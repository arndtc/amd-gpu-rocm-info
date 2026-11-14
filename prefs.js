import Adw from "gi://Adw";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const IDS = ["auto", "amd-smi", "rocm-smi"];

export default class AmdGpuMonitorPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage({
      title: "AMD GPU ROCm Info",
      icon_name: "utilities-system-monitor-symbolic",
    });
    const group = new Adw.PreferencesGroup();
    const model = new Gtk.StringList();
    model.append("Auto");
    model.append("amd-smi");
    model.append("rocm-smi");

    const row = new Adw.ComboRow({
      title: "Monitoring tool",
      model,
    });

    let updating = false;
    const showStoredValue = () => {
      const value = settings.get_string("smi-tool");
      const index = IDS.indexOf(value);
      const selected = index === -1 ? 0 : index;
      if (row.selected === selected) return;
      updating = true;
      row.selected = selected;
      updating = false;
    };

    row.connect("notify::selected", () => {
      if (updating) return;
      const id = IDS[row.selected] ?? "auto";
      if (settings.get_string("smi-tool") !== id) settings.set_string("smi-tool", id);
    });
    settings.connect("changed::smi-tool", showStoredValue);
    showStoredValue();

    group.add(row);
    page.add(group);
    window.add(page);
  }
}
