import { Client } from "basic-ftp";
import * as path from "path";
import * as fs from "fs";

const LOG_EXTENSIONS = new Set([".rlog", ".wpilog", ".wpilogxz", ".hoot", ".revlog"]);

export interface RemoteFile {
  name: string;
  size: number;
}

export interface DownloadProgress {
  filename: string;
  bytes: number;
  total: number;
}

const FTP_TIMEOUT_MS = 3000;

export class FTPDownloader {
  private client: Client = new Client(FTP_TIMEOUT_MS);
  private _connected = false;

  get isConnected(): boolean {
    return this._connected && !this.client.closed;
  }

  async connect(host: string): Promise<boolean> {
    // Reuse open connection
    if (!this.client.closed && this._connected) {
      try {
        await this.client.pwd();
        return true;
      } catch {
        this._connected = false;
      }
    }

    try {
      if (!this.client.closed) this.client.close();
      this.client = new Client(FTP_TIMEOUT_MS);
      this.client.ftp.verbose = false;
      await this.client.access({ host, user: "anonymous", password: "" });
      this._connected = true;
      return true;
    } catch {
      this._connected = false;
      return false;
    }
  }

  async listLogs(remotePath: string): Promise<RemoteFile[]> {
    if (!this.isConnected) return [];
    try {
      const items = await this.client.list(remotePath);
      return items
        .filter(f => f.isFile && LOG_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
        .map(f => ({ name: f.name, size: f.size }));
    } catch {
      this._connected = false;
      return [];
    }
  }

  async downloadFile(
    remotePath: string,
    filename: string,
    localDir: string,
    totalBytes: number,
    onProgress?: (p: DownloadProgress) => void
  ): Promise<string | null> {
    if (!this.isConnected) return null;

    const localPath = path.join(localDir, filename);
    const remoteFile = remotePath.replace(/\/$/, "") + "/" + filename;

    try {
      fs.mkdirSync(localDir, { recursive: true });

      if (onProgress) {
        this.client.trackProgress(info => {
          onProgress({ filename, bytes: info.bytes, total: totalBytes });
        });
      }

      await this.client.downloadTo(localPath, remoteFile);
      this.client.trackProgress();
      return localPath;
    } catch {
      this.client.trackProgress();
      this._connected = false;
      return null;
    }
  }

  disconnect(): void {
    if (!this.client.closed) this.client.close();
    this._connected = false;
  }
}
