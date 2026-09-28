const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");
const {
  readJson,
  writeJson,
  createProject,
  openProject,
  readTree,
  readFile,
  writeFile,
  createFile,
  createFolder,
  deleteEntry,
  renameEntry,
  safeResolve
} = require("./project-service");

let mainWindow;
let previewServer = null;
let previewPort = null;
const terminals = new Map();
let terminalCounter = 0;

function dataFile(name) {
  return path.join(app.getPath("userData"), name);
}

function defaultSettings() {
  return {
    theme: "dark",
    fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    autoSave: true,
    lineNumbers: true,
    breadcrumbs: true,
    minimap: false,
    aiMode: "review",
    previewAutoReload: true,
    panel: {
      explorer: true,
      ai: true,
      bottom: true
    }
  };
}

function readSettings() {
  return { ...defaultSettings(), ...(readJson(dataFile("settings.json"), {}) || {}) };
}

function saveSettings(settings) {
  const next = { ...defaultSettings(), ...(settings || {}) };
  writeJson(dataFile("settings.json"), next);
  return next;
}

function readRecent() {
  return (readJson(dataFile("recent-projects.json"), []) || [])
    .filter(item => item && item.path && fs.existsSync(item.path));
}

function saveRecent(items) {
  writeJson(dataFile("recent-projects.json"), items.slice(0, 30));
}

function rememberProject(project) {
  const recent = readRecent().filter(item => item.path !== project.path);
  recent.unshift({
    path: project.path,
    name: project.name,
    type: project.config?.type || "project",
    openedAt: new Date().toISOString()
  });
  saveRecent(recent);
  return project;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: "#0b0d12",
    title: "CodeNost",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../src/index.html"));
  mainWindow.setMenuBarVisibility(false);
}

function authStatus() {
  const devBypass = process.env.CODENOST_DEV_BYPASS === "1";
  const session = readJson(dataFile("session.json"), null);
  return {
    authenticated: devBypass || Boolean(session?.authenticated),
    devBypass,
    user: session?.user || null,
    configured: Boolean(process.env.CODENOST_AUTH_URL)
  };
}

async function login(payload) {
  if (process.env.CODENOST_DEV_BYPASS === "1") {
    const session = { authenticated: true, user: { email: "dev@local" } };
    writeJson(dataFile("session.json"), session);
    return { ok: true, ...session };
  }

  const authUrl = process.env.CODENOST_AUTH_URL;
  if (!authUrl) {
    return { ok: false, error: "Le serveur d'authentification CodeNost n'est pas encore configuré." };
  }

  const response = await fetch(authUrl.replace(/\/$/, "") + "/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { ok: false, error: "Connexion refusée." };
  }

  const data = await response.json();
  if (!data?.token) return { ok: false, error: "Réponse d'authentification invalide." };

  writeJson(dataFile("session.json"), {
    authenticated: true,
    token: data.token,
    user: data.user || { email: payload.email }
  });

  return { ok: true, user: data.user || { email: payload.email } };
}

function getShells() {
  if (process.platform === "win32") {
    return [
      { id: "powershell", label: "PowerShell", command: "powershell.exe" },
      { id: "cmd", label: "Invite de commandes", command: "cmd.exe" }
    ];
  }
  const shellPath = process.env.SHELL || "/bin/bash";
  return [{ id: path.basename(shellPath), label: path.basename(shellPath), command: shellPath }];
}

function createTerminal(projectPath, requestedShell) {
  const shells = getShells();
  const shellInfo = shells.find(item => item.id === requestedShell) || shells[0];
  const child = spawn(shellInfo.command, [], {
    cwd: projectPath || os.homedir(),
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const id = "terminal-" + (++terminalCounter);
  terminals.set(id, child);

  child.stdout.on("data", data => {
    mainWindow?.webContents.send("terminal:data", { id, data: data.toString() });
  });
  child.stderr.on("data", data => {
    mainWindow?.webContents.send("terminal:data", { id, data: data.toString() });
  });
  child.on("exit", code => {
    terminals.delete(id);
    mainWindow?.webContents.send("terminal:exit", { id, code });
  });

  return { id, shell: shellInfo.label };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  })[ext] || "application/octet-stream";
}

function stopPreview() {
  if (previewServer) previewServer.close();
  previewServer = null;
  previewPort = null;
}

function startPreview(projectPath) {
  stopPreview();
  const config = readJson(path.join(projectPath, ".pcn"), {});
  if (config?.commands?.preview !== "static") {
    return {
      ok: false,
      error: "La preview intégrée automatique est disponible pour les projets statiques. Pour React/Vite, lance d'abord le serveur du projet dans le terminal."
    };
  }

  previewServer = http.createServer((req, res) => {
    try {
      const raw = decodeURIComponent((req.url || "/").split("?")[0]);
      const relative = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
      const file = safeResolve(projectPath, relative);

      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(403);
      res.end("Forbidden");
    }
  });

  return new Promise(resolve => {
    previewServer.listen(0, "127.0.0.1", () => {
      previewPort = previewServer.address().port;
      resolve({ ok: true, url: "http://127.0.0.1:" + previewPort + "/" });
    });
  });
}

app.whenReady().then(() => {
  ipcMain.handle("auth:status", () => authStatus());
  ipcMain.handle("auth:login", (_event, payload) => login(payload));
  ipcMain.handle("auth:logout", () => {
    try { fs.rmSync(dataFile("session.json"), { force: true }); } catch {}
    return true;
  });
  ipcMain.handle("auth:open-signup", () => shell.openExternal(process.env.CODENOST_SIGNUP_URL || "https://codenost.com/inscription"));

  ipcMain.handle("projects:list", () => readRecent());
  ipcMain.handle("projects:choose-location", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("projects:create", (_event, payload) => rememberProject(createProject(payload)));
  ipcMain.handle("projects:import-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
    if (result.canceled) return null;
    return rememberProject(openProject(result.filePaths[0]));
  });
  ipcMain.handle("projects:open", (_event, projectPath) => rememberProject(openProject(projectPath)));
  ipcMain.handle("projects:remove-recent", (_event, projectPath) => {
    saveRecent(readRecent().filter(item => item.path !== projectPath));
    return true;
  });
  ipcMain.handle("projects:read-tree", (_event, projectPath) => readTree(projectPath));
  ipcMain.handle("projects:read-file", (_event, { projectPath, relativePath }) => readFile(projectPath, relativePath));
  ipcMain.handle("projects:write-file", (_event, { projectPath, relativePath, content }) => writeFile(projectPath, relativePath, content));
  ipcMain.handle("projects:create-file", (_event, { projectPath, relativePath }) => createFile(projectPath, relativePath));
  ipcMain.handle("projects:create-folder", (_event, { projectPath, relativePath }) => createFolder(projectPath, relativePath));
  ipcMain.handle("projects:delete-entry", (_event, { projectPath, relativePath }) => deleteEntry(projectPath, relativePath));
  ipcMain.handle("projects:rename-entry", (_event, { projectPath, relativePath, nextRelativePath }) => renameEntry(projectPath, relativePath, nextRelativePath));
  ipcMain.handle("projects:read-config", (_event, projectPath) => readJson(path.join(projectPath, ".pcn"), {}));
  ipcMain.handle("projects:write-config", (_event, { projectPath, config }) => writeJson(path.join(projectPath, ".pcn"), config));

  ipcMain.handle("terminal:shells", () => getShells());
  ipcMain.handle("terminal:create", (_event, { projectPath, shell: requestedShell }) => createTerminal(projectPath, requestedShell));
  ipcMain.handle("terminal:write", (_event, { terminalId, data }) => {
    const terminal = terminals.get(terminalId);
    if (!terminal) return false;
    terminal.stdin.write(data);
    return true;
  });
  ipcMain.handle("terminal:kill", (_event, terminalId) => {
    terminals.get(terminalId)?.kill();
    terminals.delete(terminalId);
    return true;
  });

  ipcMain.handle("preview:start", (_event, projectPath) => startPreview(projectPath));
  ipcMain.handle("preview:stop", () => { stopPreview(); return true; });

  ipcMain.handle("settings:read", () => readSettings());
  ipcMain.handle("settings:write", (_event, settings) => saveSettings(settings));
  ipcMain.handle("system:open-external", (_event, url) => shell.openExternal(url));

  createWindow();
});

app.on("window-all-closed", () => {
  stopPreview();
  for (const child of terminals.values()) child.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
