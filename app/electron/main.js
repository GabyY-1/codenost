const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");
const { createSupabaseService } = require("./supabase-service");
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
let supabaseService = null;
let pendingAuthUrl = null;
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

function readHiddenCloudProjects() {
  return new Set(readJson(dataFile("hidden-cloud-projects.json"), []) || []);
}

function saveHiddenCloudProjects(ids) {
  writeJson(dataFile("hidden-cloud-projects.json"), [...ids]);
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

async function handleAuthUrl(url) {
  if (!supabaseService) {
    pendingAuthUrl = url;
    return;
  }

  const result = await supabaseService.handleAuthCallback(url);
  if (result.ok) {
    mainWindow?.webContents.send("auth:changed", {
      authenticated: true,
      configured: true,
      devBypass: false,
      user: result.user
    });
  } else {
    mainWindow?.webContents.send("auth:changed", {
      authenticated: false,
      configured: true,
      error: result.error
    });
  }
}

function getShells() {
  if (process.platform === "win32") {
    return [
      { id: "powershell", label: "PowerShell", command: "powershell.exe", args: ["-NoLogo"] },
      { id: "cmd", label: "Invite de commandes", command: "cmd.exe", args: [] }
    ];
  }
  const shellPath = process.env.SHELL || "/bin/bash";
  return [{ id: path.basename(shellPath), label: path.basename(shellPath), command: shellPath, args: ["-i"] }];
}

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", data => stdout += data.toString());
    child.stderr.on("data", data => stderr += data.toString());
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || command + " a échoué."));
    });
  });
}

async function cloneGithubProject({ url, location, cloud = true }) {
  const value = String(url || "").trim();
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(value)) {
    throw new Error("URL GitHub invalide.");
  }

  const base = location || path.join(os.homedir(), "CodeNost");
  fs.mkdirSync(base, { recursive: true });

  const repoName = value.split("/").pop().replace(/\.git$/i, "");
  const target = path.join(base, repoName);
  if (fs.existsSync(target)) throw new Error("Un dossier portant ce nom existe déjà.");

  await runProcess("git", ["clone", value, target], base);
  const project = openProject(target);
  const config = project.config || {};
  config.cloud = { ...(config.cloud || {}), enabled: Boolean(cloud) };
  writeJson(path.join(target, ".pcn"), config);
  return openProject(target);
}

function createTerminal(projectPath, requestedShell) {
  const shells = getShells();
  const shellInfo = shells.find(item => item.id === requestedShell) || shells[0];
  const child = spawn(shellInfo.command, shellInfo.args || [], {
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

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("codenost", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("codenost");
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find(arg => arg.startsWith("codenost://"));
    if (url) handleAuthUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleAuthUrl(url);
});

app.whenReady().then(async () => {
  supabaseService = createSupabaseService({ userDataPath: app.getPath("userData") });

  ipcMain.handle("auth:status", () => supabaseService.status());
  ipcMain.handle("auth:login", (_event, payload) => supabaseService.login(payload));
  ipcMain.handle("auth:logout", () => supabaseService.logout());
  ipcMain.handle("auth:github-login", async () => {
    const result = await supabaseService.startGithubOAuth();
    if (result.ok && result.url) await shell.openExternal(result.url);
    return result;
  });
  ipcMain.handle("auth:open-signup", () => {
    const url = process.env.CODENOST_SIGNUP_URL;
    if (!url) return { ok: false, error: "Aucune page d'inscription CodeNost n'est configurée." };
    shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("projects:list", async () => {
    const local = readRecent();
    try {
      const hidden = readHiddenCloudProjects();
      const cloud = (await supabaseService.listCloudProjects())
        .filter(project => !hidden.has(project.id))
        .filter(project => !local.some(item => {
          try {
            const cfg = readJson(path.join(item.path, ".pcn"), {});
            return cfg?.cloud?.projectId === project.id;
          } catch {
            return false;
          }
        }))
        .map(project => ({
          path: "cloud://" + project.id,
          name: project.name,
          type: project.type,
          openedAt: project.openedAt
        }));
      return [...local, ...cloud];
    } catch {
      return local;
    }
  });
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
  ipcMain.handle("projects:clone-github", async (_event, payload) => {
    return rememberProject(await cloneGithubProject(payload));
  });
  ipcMain.handle("projects:open", async (_event, projectPath) => {
    if (String(projectPath).startsWith("cloud://")) {
      const projectId = String(projectPath).slice("cloud://".length);
      const downloaded = await supabaseService.downloadProject(
        projectId,
        path.join(os.homedir(), "CodeNost")
      );
      const hidden = readHiddenCloudProjects();
      hidden.delete(projectId);
      saveHiddenCloudProjects(hidden);
      return rememberProject(downloaded);
    }
    return rememberProject(openProject(projectPath));
  });
  ipcMain.handle("projects:remove-recent", (_event, projectPath) => {
    if (String(projectPath).startsWith("cloud://")) {
      const hidden = readHiddenCloudProjects();
      hidden.add(String(projectPath).slice("cloud://".length));
      saveHiddenCloudProjects(hidden);
      return true;
    }
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
  ipcMain.handle("preview:open-window", (_event, url) => {
    if (!url || !/^https?:\/\//i.test(url)) return false;
    const previewWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 500,
      minHeight: 400,
      title: "CodeNost Preview",
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    previewWindow.loadURL(url);
    return true;
  });

  ipcMain.handle("settings:read", async () => {
    const local = readSettings();
    try {
      const cloud = await supabaseService.readCloudSettings();
      return { ...local, ...cloud };
    } catch {
      return local;
    }
  });

  ipcMain.handle("settings:write", async (_event, settings) => {
    const local = saveSettings(settings);
    try { await supabaseService.writeCloudSettings(local); } catch {}
    return local;
  });

  ipcMain.handle("cloud:sync-project", async (_event, projectPath) => {
    const config = readJson(path.join(projectPath, ".pcn"), {});
    return supabaseService.syncProject(projectPath, config);
  });

  ipcMain.handle("cloud:resolve-conflict", (_event, payload) => {
    return supabaseService.resolveConflict(
      payload.projectPath,
      payload.projectId,
      payload.conflict,
      payload.choice
    );
  });

  ipcMain.handle("system:open-external", (_event, url) => shell.openExternal(url));

  createWindow();

  if (pendingAuthUrl) {
    const url = pendingAuthUrl;
    pendingAuthUrl = null;
    handleAuthUrl(url);
  } else {
    const startupUrl = process.argv.find(arg => arg.startsWith("codenost://"));
    if (startupUrl) handleAuthUrl(startupUrl);
  }
});

app.on("window-all-closed", () => {
  stopPreview();
  for (const child of terminals.values()) child.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
