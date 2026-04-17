import { app } from "electron";
import * as path from "path";
import * as fs from "fs";

export interface Preferences {
  robotAddress: string;
  useUSB: boolean;
  remotePath: string;
  localSavePath: string;
  pollIntervalMs: number;
  autoDownload: boolean;
  autoUpload: boolean;
  driveRootFolder: string;
  competitionMode: boolean;
  competitionName: string;
  googleClientId: string;
  googleClientSecret: string;
}

const DEFAULTS: Preferences = {
  robotAddress: "10.0.0.2",
  useUSB: false,
  remotePath: "/U/logs",
  localSavePath: "",
  pollIntervalMs: 5000,
  autoDownload: true,
  autoUpload: true,
  driveRootFolder: "ZapLogs",
  competitionMode: false,
  competitionName: "",
  googleClientId: "",
  googleClientSecret: "",
};

export class PreferencesManager {
  private filePath: string;
  private data: Preferences;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "preferences.json");
    this.data = this.load();
    if (!this.data.localSavePath) {
      this.data.localSavePath = path.join(app.getPath("home"), "ZapLogs");
      this.save();
    }
  }

  private load(): Preferences {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  get(): Preferences {
    return { ...this.data };
  }

  update(partial: Partial<Preferences>): void {
    this.data = { ...this.data, ...partial };
    this.save();
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
