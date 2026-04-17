import { contextBridge, ipcRenderer } from "electron";

export interface StatusEvent {
  type: string;
  data: Record<string, unknown>;
}

contextBridge.exposeInMainWorld("zapLogs", {
  getPreferences: () => ipcRenderer.invoke("get-preferences"),
  savePreferences: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke("save-preferences", partial),
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  authenticateDrive: () => ipcRenderer.invoke("authenticate-drive"),
  getDriveStatus: () => ipcRenderer.invoke("get-drive-status"),
  revokeDrive: () => ipcRenderer.invoke("revoke-drive"),
  triggerScan: () => ipcRenderer.invoke("trigger-scan"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  onStatus: (cb: (event: StatusEvent) => void) => {
    ipcRenderer.on("status", (_e, event: StatusEvent) => cb(event));
  },
});
