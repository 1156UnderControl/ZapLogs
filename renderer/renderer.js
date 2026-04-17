/* global window */
const api = window.zapLogs;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const statusBadge  = document.getElementById("status-badge");
const statusText   = document.getElementById("status-text");
const driveBadge   = document.getElementById("drive-badge");
const opBar        = document.getElementById("op-bar");
const opLabel      = document.getElementById("op-label");
const progressFill = document.getElementById("progress-fill");
const progressPct  = document.getElementById("progress-pct");
const logList      = document.getElementById("log-list");

const viewMain     = document.getElementById("view-main");
const viewSettings = document.getElementById("view-settings");
const btnOpenSettings = document.getElementById("btn-open-settings");

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

const btnPickDir = document.getElementById("btn-pick-dir");
const btnAuth    = document.getElementById("btn-auth");
const btnRevoke  = document.getElementById("btn-revoke");
const btnSave    = document.getElementById("btn-save");
const btnCancel  = document.getElementById("btn-cancel");
const btnScan    = document.getElementById("btn-scan");
const btnClear   = document.getElementById("btn-clear");

const driveConnectedState = document.getElementById("drive-connected-state");
const driveSetupState     = document.getElementById("drive-setup-state");

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const [prefs, ds] = await Promise.all([api.getPreferences(), api.getDriveStatus()]);

  fRobotAddr.value      = prefs.robotAddress;
  fUseUSB.checked       = prefs.useUSB;
  fRemotePath.value     = prefs.remotePath;
  fLocalPath.value      = prefs.localSavePath;
  fPollInterval.value   = prefs.pollIntervalMs;
  fAutoDownload.checked = prefs.autoDownload;
  fAutoUpload.checked   = prefs.autoUpload;
  fDriveFolder.value    = prefs.driveRootFolder;
  fCompMode.checked     = prefs.competitionMode;
  fCompName.value       = prefs.competitionName;
  fClientId.value       = prefs.googleClientId;
  fClientSecret.value   = prefs.googleClientSecret;

  updateCompNameRow();
  updateDriveUI(ds.authenticated);

  api.onStatus(handleStatus);
}

// ── Settings nav ──────────────────────────────────────────────────────────────
document.querySelectorAll(".sp-nav").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sp-nav").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".sp-section").forEach(s => s.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById("sp-" + btn.dataset.sec).classList.remove("hidden");
    const body = document.querySelector(".sp-body");
    if (body) body.scrollTop = 0;
  });
});

// ── Open / close settings ─────────────────────────────────────────────────────
function openSettings() {
  viewMain.classList.add("hidden");
  viewSettings.classList.remove("hidden");
  btnOpenSettings.classList.add("active");
  const body = document.querySelector(".sp-body");
  if (body) body.scrollTop = 0;
}

function closeSettings() {
  viewSettings.classList.add("hidden");
  viewMain.classList.remove("hidden");
  btnOpenSettings.classList.remove("active");
}

btnOpenSettings.addEventListener("click", () => {
  if (viewSettings.classList.contains("hidden")) openSettings();
  else closeSettings();
});

btnCancel.addEventListener("click", closeSettings);

// ── Status handler ────────────────────────────────────────────────────────────
function handleStatus({ type, data }) {
  switch (type) {
    case "connecting":
      setConn("connecting", `Connecting to ${data.address}…`);
      break;
    case "connected":
      setConn("connected", data.address);
      addLog("info", "⚡", `Connected to ${data.address}`);
      hideOp();
      break;
    case "disconnected":
      setConn("disconnected", "Not connected");
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
      showOp("Uploading", data.filename, data.pct);
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

// ── Connection badge ──────────────────────────────────────────────────────────
function setConn(state, text) {
  statusBadge.className = `status-badge ${state}`;
  statusText.textContent = text;
}

// ── Op bar ────────────────────────────────────────────────────────────────────
function showOp(action, filename, pct) {
  const short = filename.length > 36 ? filename.slice(0, 33) + "…" : filename;
  opLabel.textContent        = `${action}: ${short}`;
  progressFill.style.width   = `${pct}%`;
  progressPct.textContent    = `${pct}%`;
  opBar.classList.remove("hidden");
}

function hideOp() { opBar.classList.add("hidden"); }

// ── Log ───────────────────────────────────────────────────────────────────────
function addLog(cls, icon, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  const el = document.createElement("div");
  el.className = `log-entry ${cls}`;
  el.innerHTML = `
    <span class="log-time">${ts}</span>
    <span class="log-icon">${icon}</span>
    <span class="log-msg">${esc(msg)}</span>
  `;
  logList.appendChild(el);
  while (logList.children.length > 300) logList.removeChild(logList.firstChild);
  logList.scrollTop = logList.scrollHeight;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Drive UI ──────────────────────────────────────────────────────────────────
function updateDriveUI(authenticated) {
  driveBadge.textContent = authenticated ? "Drive ✓" : "Drive";
  driveBadge.className   = authenticated ? "drive-badge authed" : "drive-badge";
  driveConnectedState.classList.toggle("hidden", !authenticated);
  driveSetupState.classList.toggle("hidden", authenticated);
}

// ── Competition name row ──────────────────────────────────────────────────────
function updateCompNameRow() {
  compNameRow.style.display = fCompMode.checked ? "block" : "none";
}
fCompMode.addEventListener("change", updateCompNameRow);

// ── Buttons ───────────────────────────────────────────────────────────────────
btnPickDir.addEventListener("click", async () => {
  const dir = await api.pickDirectory();
  if (dir) fLocalPath.value = dir;
});

btnAuth.addEventListener("click", async () => {
  const orig = btnAuth.textContent;
  btnAuth.textContent = "Opening browser…";
  btnAuth.disabled = true;

  // Save credentials first so the main process can initialize Drive
  await savePrefs();

  const result = await api.authenticateDrive();
  btnAuth.disabled = false;
  btnAuth.textContent = orig;

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
  await savePrefs();
  addLog("ok", "✓", "Settings saved");
  closeSettings();
});

btnScan.addEventListener("click", async () => {
  btnScan.disabled = true;
  await api.triggerScan();
  btnScan.disabled = false;
});

btnClear.addEventListener("click", async () => {
  if (!window.confirm("Clear download history?\n\nZapLogs will re-download all files currently on the roboRIO on the next connection.")) return;
  await api.clearHistory();
  addLog("warn", "!", "Download history cleared");
});

// ── Save helper ───────────────────────────────────────────────────────────────
async function savePrefs() {
  await api.savePreferences({
    robotAddress:       fRobotAddr.value.trim(),
    useUSB:             fUseUSB.checked,
    remotePath:         fRemotePath.value.trim() || "/U/logs",
    localSavePath:      fLocalPath.value.trim(),
    pollIntervalMs:     Number(fPollInterval.value) || 5000,
    autoDownload:       fAutoDownload.checked,
    autoUpload:         fAutoUpload.checked,
    driveRootFolder:    fDriveFolder.value.trim() || "ZapLogs",
    competitionMode:    fCompMode.checked,
    competitionName:    fCompName.value.trim(),
    googleClientId:     fClientId.value.trim(),
    googleClientSecret: fClientSecret.value.trim(),
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
