import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { app, shell } from "electron";

const REDIRECT_PORT = 42813;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export class DriveUploader {
  private auth: InstanceType<typeof google.auth.OAuth2> | null = null;
  private tokensPath: string;
  private folderCache = new Map<string, string>();

  constructor() {
    this.tokensPath = path.join(app.getPath("userData"), "google_tokens.json");
  }

  init(clientId: string, clientSecret: string): void {
    this.auth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
    try {
      const tokens = JSON.parse(fs.readFileSync(this.tokensPath, "utf-8"));
      this.auth.setCredentials(tokens);
    } catch {
      // Not authenticated yet
    }
  }

  get isAuthenticated(): boolean {
    if (!this.auth) return false;
    const { access_token, refresh_token } = this.auth.credentials;
    return !!(access_token || refresh_token);
  }

  async authenticate(): Promise<void> {
    if (!this.auth) throw new Error("Drive not initialized — set OAuth credentials first");

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        if (!req.url?.includes("code=")) {
          res.end();
          return;
        }
        try {
          const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
          const code = url.searchParams.get("code");
          if (!code) throw new Error("No auth code in redirect");

          res.setHeader("Content-Type", "text/html");
          res.end(
            `<html><body style="font-family:sans-serif;padding:40px;background:#0d1117;color:#58a6ff">
              <h2>ZapLogs connected to Google Drive!</h2>
              <p style="color:#8b949e">You can close this window and return to ZapLogs.</p>
            </body></html>`
          );
          server.close();

          const { tokens } = await this.auth!.getToken(code);
          this.auth!.setCredentials(tokens);
          fs.mkdirSync(path.dirname(this.tokensPath), { recursive: true });
          fs.writeFileSync(this.tokensPath, JSON.stringify(tokens));
          resolve();
        } catch (err) {
          server.close();
          reject(err);
        }
      });

      server.listen(REDIRECT_PORT, () => {
        const authUrl = this.auth!.generateAuthUrl({
          access_type: "offline",
          scope: SCOPES,
          prompt: "consent",
        });
        shell.openExternal(authUrl);
      });

      server.on("error", reject);
    });
  }

  private driveClient() {
    if (!this.auth) throw new Error("Drive not authenticated");
    return google.drive({ version: "v3", auth: this.auth });
  }

  private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const key = `${parentId ?? "root"}/${name}`;
    const cached = this.folderCache.get(key);
    if (cached) return cached;

    const drive = this.driveClient();
    const q = parentId
      ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
      : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

    const existing = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
    const id = existing.data.files?.[0]?.id;
    if (id) {
      this.folderCache.set(key, id);
      return id;
    }

    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: "id",
    });
    const newId = created.data.id!;
    this.folderCache.set(key, newId);
    return newId;
  }

  async uploadFile(
    localPath: string,
    filename: string,
    rootFolder: string,
    subFolder: string,
    onProgress?: (pct: number) => void
  ): Promise<string | null> {
    if (!this.auth) return null;

    const rootId = await this.getOrCreateFolder(rootFolder);
    const subId = await this.getOrCreateFolder(subFolder, rootId);
    const fileSize = fs.statSync(localPath).size;
    const drive = this.driveClient();

    const res = await drive.files.create(
      {
        requestBody: { name: filename, parents: [subId] },
        media: { body: fs.createReadStream(localPath) },
        fields: "id, webViewLink",
      },
      {
        onUploadProgress: (evt: { bytesRead: number }) => {
          if (onProgress && fileSize > 0) {
            onProgress(Math.min(100, Math.round((evt.bytesRead / fileSize) * 100)));
          }
        },
      }
    );

    return res.data.webViewLink ?? res.data.id ?? null;
  }

  revoke(): void {
    try { fs.unlinkSync(this.tokensPath); } catch { /* no tokens file */ }
    this.auth?.revokeCredentials().catch(() => { /* ignore */ });
    if (this.auth) this.auth.setCredentials({});
    this.folderCache.clear();
  }
}
