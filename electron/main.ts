import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";
import { PreferencesManager } from "./preferences";
import { FTPDownloader } from "./ftp";
import { DriveUploader } from "./drive";

const USB_ADDRESS = "172.22.11.2";

function normalizeIP(addr: string): string {
  // Fix leading zeros: 10.09.01.2 -> 10.9.1.2
  return addr.replace(/\b0*(\d+)\b/g, (_, n: string) => String(parseInt(n, 10)));
}

function todayFolder(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

class ZapLogs {
  private win: BrowserWindow | null = null;
  private prefs = new PreferencesManager();
  private ftp = new FTPDownloader();
  private drive = new DriveUploader();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private connState: "none" | "connecting" | "connected" | "disconnected" = "none";

  private downloadedFiles: Set<string>;
  private historyPath: string;

  constructor() {
    this.historyPath = path.join(app.getPath("userData"), "downloaded_files.json");
    this.downloadedFiles = this.loadHistory();
    this.initDrive();
  }

  private initDrive(): void {
    const p = this.prefs.get();
    if (p.googleClientId && p.googleClientSecret) {
      this.drive.init(p.googleClientId, p.googleClientSecret);
    }
  }

  private loadHistory(): Set<string> {
    try {
      const data = JSON.parse(fs.readFileSync(this.historyPath, "utf-8")) as string[];
      return new Set(data);
    } catch {
      return new Set();
    }
  }

  private saveHistory(): void {
    fs.mkdirSync(path.dirname(this.historyPath), { recursive: true });
    fs.writeFileSync(this.historyPath, JSON.stringify([...this.downloadedFiles]));
  }

  createWindow(): void {
    this.win = new BrowserWindow({
      width: 920,
      height: 680,
      minWidth: 700,
      minHeight: 520,
      backgroundColor: "#0d1117",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
      title: "ZapLogs",
    });

    this.win.loadFile(path.join(__dirname, "../renderer/index.html"));
    this.setupIPC();
    this.startPolling();
  }

  // ── IPC ──────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    ipcMain.handle("get-preferences", () => this.prefs.get());

    ipcMain.handle("save-preferences", (_e, partial: Record<string, unknown>) => {
      this.prefs.update(partial);
      this.initDrive();
      // Reset connection state so the user sees a fresh attempt with the new address
      this.connState = "none";
      this.ftp.disconnect();
      this.restartPolling();
      return true;
    });

    ipcMain.handle("pick-directory", async () => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle("authenticate-drive", async () => {
      try {
        await this.drive.authenticate();
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    ipcMain.handle("get-drive-status", () => ({
      authenticated: this.drive.isAuthenticated,
    }));

    ipcMain.handle("revoke-drive", () => {
      this.drive.revoke();
    });

    ipcMain.handle("trigger-scan", async () => {
      if (this.busy) return { error: "Already scanning" };
      await this.poll();
      return { success: true };
    });

    ipcMain.handle("clear-history", () => {
      this.downloadedFiles.clear();
      this.saveHistory();
    });
  }

  // ── Status events ─────────────────────────────────────────────────────────

  private emit(type: string, data: Record<string, unknown> = {}): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send("status", { type, data });
    }
  }

  private emitConn(next: "connecting" | "connected" | "disconnected", address: string): void {
    if (this.connState === next) return;
    this.connState = next;
    this.emit(next, { address });
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  private startPolling(): void {
    const { pollIntervalMs } = this.prefs.get();
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), pollIntervalMs);
  }

  private restartPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.startPolling();
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runCycle();
    } finally {
      this.busy = false;
    }
  }

  private async runCycle(): Promise<void> {
    const p = this.prefs.get();
    const address = p.useUSB ? USB_ADDRESS : normalizeIP(p.robotAddress);

    // Only show "connecting" on the very first attempt — avoid flashing "Connecting…"
    // every poll when the roboRIO isn't reachable.
    if (this.connState === "none") {
      this.emitConn("connecting", address);
    }

    const ok = await this.ftp.connect(address);

    if (!ok) {
      this.emitConn("disconnected", address);
      return;
    }

    this.emitConn("connected", address);

    if (!p.autoDownload) return;

    const remoteFiles = await this.ftp.listLogs(p.remotePath);
    const newFiles = remoteFiles.filter(f => !this.downloadedFiles.has(f.name));

    if (newFiles.length === 0) {
      this.emit("no-new-files", {});
      return;
    }

    this.emit("found", { count: newFiles.length, files: newFiles.map(f => f.name) });

    for (const file of newFiles) {
      await this.processFile(file.name, file.size, p);
    }
  }

  private async processFile(
    filename: string,
    fileSize: number,
    p: ReturnType<PreferencesManager["get"]>
  ): Promise<void> {
    this.emit("downloading", { filename, pct: 0 });

    const localPath = await this.ftp.downloadFile(
      p.remotePath,
      filename,
      p.localSavePath,
      fileSize,
      ({ bytes, total }) => {
        const pct = total > 0 ? Math.round((bytes / total) * 100) : 0;
        this.emit("downloading", { filename, pct });
      }
    );

    if (!localPath) {
      this.emit("download-error", { filename });
      return;
    }

    this.downloadedFiles.add(filename);
    this.saveHistory();
    this.emit("downloaded", { filename, localPath });

    if (!p.autoUpload || !this.drive.isAuthenticated) return;

    this.emit("uploading", { filename, pct: 0 });

    const subfolder =
      p.competitionMode && p.competitionName ? p.competitionName : todayFolder();

    const link = await this.drive
      .uploadFile(localPath, filename, p.driveRootFolder, subfolder, pct => {
        this.emit("uploading", { filename, pct });
      })
      .catch(() => null);

    if (link) {
      this.emit("uploaded", { filename, link, subfolder });
    } else {
      this.emit("upload-error", { filename });
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.ftp.disconnect();
  }
}

let zapLogs: ZapLogs;

app.whenReady().then(() => {
  zapLogs = new ZapLogs();
  zapLogs.createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) zapLogs.createWindow();
  });
});

app.on("window-all-closed", () => {
  zapLogs?.destroy();
  if (process.platform !== "darwin") app.quit();
});
