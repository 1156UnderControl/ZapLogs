/* global window */
const api = window.zapLogs;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const statusBadge   = document.getElementById("status-badge");
const statusText    = document.getElementById("status-text");
const driveBadge    = document.getElementById("drive-badge");
const opBar         = document.getElementById("op-bar");
const opLabel       = document.getElementById("op-label");
const progressFill  = document.getElementById("progress-fill");
const progressPct   = document.getElementById("progress-pct");
const logList       = document.getElementById("log-list");

// Settings fields
const fRobotAddr    = document.getElementById("f-robot-addr");
const fUseUSB       = document.getElementById("f-use-usb");
const fRemotePath   = document.getElementById("f-remote-path");
const fLocalPath    = document.getElementById("f-local-path");
const fPollInterval = document.getElementById("f-poll-interval");
const fAutoDownload = document.getElementById("f-auto-download");
const fAutoUpload   = document.getElementById("f-auto-upload");
const fDriveFolder  = document.getElementById("f-drive-folder");
const fCompMode     = document.getElementById("f-comp-mode");
const fCompName     = document.getElementById("f-comp-name");
const fClientId     = document.getElementById("f-client-id");
const fClientSecret = document.getElementById("f-client-secret");
const compNameRow   = document.getElementById("comp-name-row");

const btnPickDir    = document.getElementById("btn-pick-dir");
const btnAuth       = document.getElementById("btn-auth");
const btnRevoke     = document.getElementById("btn-revoke");
const btnSave       = document.getElementById("btn-save");
const btnScan       = document.getElementById("btn-scan");
const btnClear      = document.getElementById("btn-clear");
const driveStatusTxt = document.getElementById("drive-status-txt");

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const prefs = await api.getPreferences();
  fRobotAddr.value    = prefs.robotAddress;
  fUseUSB.checked     = prefs.useUSB;
  fRemotePath.value   = prefs.remotePath;
  fLocalPath.value    = prefs.localSavePath;
  fPollInterval.value = prefs.pollIntervalMs;
  fAutoDownload.checked = prefs.autoDownload;
  fAutoUpload.checked   = prefs.autoUpload;
  fDriveFolder.value  = prefs.driveRootFolder;
  fCompMode.checked   = prefs.competitionMode;
  fCompName.value     = prefs.competitionName;
  fClientId.value     = prefs.googleClientId;
  fClientSecret.value = prefs.googleClientSecret;
  toggleCompNameRow();

  const ds = await api.getDriveStatus();
  updateDriveUI(ds.authenticated);

  api.onStatus(handleStatus);
}

// ── Status event handler ──────────────────────────────────────────────────────
function handleStatus({ type, data }) {
  switch (type) {
    case "connecting":
      setConnectionState("connecting", `Connecting to ${data.address}…`);
      break;
    case "connected":
      setConnectionState("connected", `${data.address}`);
      addLog("info", "⚡", `Connected to ${data.address}`);
      hideOp();
      break;
    case "disconnected":
      setConnectionState("disconnected", "Not connected");
      hideOp();
      break;
    case "found":
      addLog("info", "🔍", `Found ${data.count} new log file${data.count !== 1 ? "s" : ""}`);
      break;
    case "no-new-files":
      addLog("info", "✓", "No new files");
      hideOp();
      break;
    case "downloading":
      showOp("Downloading", data.filename, data.pct);
      break;
    case "downloaded":
      hideOp();
      addLog("ok", "↓", `Downloaded ${data.filename}`);
      break;
    case "download-error":
      hideOp();
      addLog("err", "✗", `Download failed: ${data.filename}`);
      break;
    case "uploading":
      showOp("Uploading to Drive", data.filename, data.pct);
      break;
    case "uploaded":
      hideOp();
      addLog("upload", "↑", `Uploaded ${data.filename} → Drive/${data.subfolder}`);
      updateDriveUI(true);
      break;
    case "upload-error":
      hideOp();
      addLog("err", "✗", `Upload failed: ${data.filename}`);
      break;
  }
}

// ── Connection state ──────────────────────────────────────────────────────────
function setConnectionState(state, text) {
  statusBadge.className = `status-badge ${state}`;
  statusText.textContent = text;
}

// ── Operation bar ─────────────────────────────────────────────────────────────
function showOp(action, filename, pct) {
  const short = filename.length > 32 ? filename.slice(0, 29) + "…" : filename;
  opLabel.textContent = `${action}: ${short}`;
  progressFill.style.width = `${pct}%`;
  progressPct.textContent  = `${pct}%`;
  opBar.classList.remove("hidden");
}

function hideOp() {
  opBar.classList.add("hidden");
}

// ── Activity log ──────────────────────────────────────────────────────────────
function addLog(cls, icon, msg) {
  const now = new Date();
  const ts  = now.toTimeString().slice(0, 8);

  const entry = document.createElement("div");
  entry.className = `log-entry ${cls}`;
  entry.innerHTML = `
    <span class="log-time">${ts}</span>
    <span class="log-icon">${icon}</span>
    <span class="log-msg">${escHtml(msg)}</span>
  `;
  logList.appendChild(entry);

  // Keep last 200 entries
  while (logList.children.length > 200) {
    logList.removeChild(logList.firstChild);
  }

  logList.scrollTop = logList.scrollHeight;
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Drive UI ──────────────────────────────────────────────────────────────────
function updateDriveUI(authenticated) {
  if (authenticated) {
    driveBadge.textContent = "Drive ✓";
    driveBadge.className   = "drive-badge authed";
    driveStatusTxt.textContent = "Connected to Google Drive.";
    driveStatusTxt.className   = "drive-status-text authed";
    btnAuth.style.display   = "none";
    btnRevoke.style.display = "block";
  } else {
    driveBadge.textContent = "Drive";
    driveBadge.className   = "drive-badge";
    driveStatusTxt.textContent =
      "Not connected. Add your OAuth credentials below, then click Connect.";
    driveStatusTxt.className = "drive-status-text";
    btnAuth.style.display   = "block";
    btnRevoke.style.display = "none";
  }
}

// ── Competition mode ──────────────────────────────────────────────────────────
function toggleCompNameRow() {
  compNameRow.style.display = fCompMode.checked ? "block" : "none";
}

fCompMode.addEventListener("change", toggleCompNameRow);

// ── Buttons ───────────────────────────────────────────────────────────────────
btnPickDir.addEventListener("click", async () => {
  const dir = await api.pickDirectory();
  if (dir) fLocalPath.value = dir;
});

btnAuth.addEventListener("click", async () => {
  btnAuth.textContent = "Opening browser…";
  btnAuth.disabled = true;
  const result = await api.authenticateDrive();
  btnAuth.disabled = false;
  btnAuth.textContent = "Connect Google Drive";
  if (result.success) {
    updateDriveUI(true);
    addLog("upload", "↑", "Google Drive connected");
  } else {
    addLog("err", "✗", `Drive auth failed: ${result.error}`);
  }
});

btnRevoke.addEventListener("click", async () => {
  await api.revokeDrive();
  updateDriveUI(false);
  addLog("warn", "!", "Google Drive disconnected");
});

btnSave.addEventListener("click", async () => {
  const partial = {
    robotAddress:    fRobotAddr.value.trim(),
    useUSB:          fUseUSB.checked,
    remotePath:      fRemotePath.value.trim(),
    localSavePath:   fLocalPath.value.trim(),
    pollIntervalMs:  Number(fPollInterval.value) || 5000,
    autoDownload:    fAutoDownload.checked,
    autoUpload:      fAutoUpload.checked,
    driveRootFolder: fDriveFolder.value.trim() || "ZapLogs",
    competitionMode: fCompMode.checked,
    competitionName: fCompName.value.trim(),
    googleClientId:  fClientId.value.trim(),
    googleClientSecret: fClientSecret.value.trim(),
  };
  await api.savePreferences(partial);
  addLog("ok", "✓", "Settings saved");
});

btnScan.addEventListener("click", async () => {
  btnScan.disabled = true;
  await api.triggerScan();
  btnScan.disabled = false;
});

btnClear.addEventListener("click", async () => {
  if (!window.confirm("Clear download history? ZapLogs will re-download all files on next connection.")) return;
  await api.clearHistory();
  addLog("warn", "!", "Download history cleared");
});

// ── Start ─────────────────────────────────────────────────────────────────────
init();
