const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");
const pty = require("node-pty");
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
  searchProject,
  safeResolve
} = require("./project-service");

let mainWindow;
let supabaseService = null;
let pendingAuthUrl = null;
let previewServer = null;
let previewPort = null;
let previewProcess = null;
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

function createTerminal(projectPath, requestedShell, cols = 100, rows = 30) {
  const shells = getShells();
  const shellInfo = shells.find(item => item.id === requestedShell) || shells[0];
  const id = "terminal-" + (++terminalCounter);

  const terminal = pty.spawn(shellInfo.command, shellInfo.args || [], {
    name: "xterm-256color",
    cols: Math.max(20, Number(cols) || 100),
    rows: Math.max(5, Number(rows) || 30),
    cwd: projectPath || os.homedir(),
    env: { ...process.env, TERM: "xterm-256color" }
  });

  terminals.set(id, terminal);

  terminal.onData(data => {
    mainWindow?.webContents.send("terminal:data", { id, data });
  });

  terminal.onExit(event => {
    terminals.delete(id);
    mainWindow?.webContents.send("terminal:exit", { id, code: event.exitCode });
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
  if (previewProcess) {
    try { previewProcess.kill(); } catch {}
    previewProcess = null;
  }
}

function startStaticPreview(projectPath) {
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
      resolve({ ok: true, url: "http://127.0.0.1:" + previewPort + "/", mode: "static" });
    });
  });
}

async function ensureProjectDependencies(projectPath) {
  const packageFile = path.join(projectPath, "package.json");
  const modulesDir = path.join(projectPath, "node_modules");
  if (!fs.existsSync(packageFile) || fs.existsSync(modulesDir)) return { ok: true, installed: false };

  mainWindow?.webContents.send("preview:log", "[CodeNost] Installation des dépendances…\n");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";

  try {
    const result = await runProcess(npm, ["install"], projectPath);
    if (result.stdout) mainWindow?.webContents.send("preview:log", result.stdout);
    if (result.stderr) mainWindow?.webContents.send("preview:log", result.stderr);
    return { ok: true, installed: true };
  } catch (error) {
    return { ok: false, error: "Installation des dépendances impossible : " + (error.message || error) };
  }
}

function startDevServerPreview(projectPath, command) {
  return new Promise(resolve => {
    const isWin = process.platform === "win32";
    const shellCommand = isWin ? "cmd.exe" : (process.env.SHELL || "/bin/bash");
    const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-lc", command];

    previewProcess = spawn(shellCommand, shellArgs, {
      cwd: projectPath,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let settled = false;
    let buffer = "";

    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const inspect = chunk => {
      const text = chunk.toString();
      buffer += text;
      mainWindow?.webContents.send("preview:log", text);

      const match = buffer.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:\/[^\s]*)?/i);
      if (match) {
        const url = match[0].replace("0.0.0.0", "127.0.0.1");
        finish({ ok: true, url, mode: "dev-server" });
      }
    };

    previewProcess.stdout.on("data", inspect);
    previewProcess.stderr.on("data", inspect);

    previewProcess.on("error", error => {
      finish({ ok: false, error: error.message || String(error) });
    });

    previewProcess.on("exit", code => {
      if (!settled) {
        finish({
          ok: false,
          error: "Le serveur de développement s'est arrêté" + (code == null ? "." : " (code " + code + ").") + (buffer ? "\n" + buffer.slice(-1200) : "")
        });
      }
    });

    const timeout = setTimeout(() => {
      finish({
        ok: false,
        error: "CodeNost n'a pas détecté l'URL du serveur de développement. Vérifie que les dépendances du projet sont installées."
      });
    }, 20000);
  });
}

async function startPreview(projectPath) {
  stopPreview();
  const config = readJson(path.join(projectPath, ".pcn"), {});
  const previewMode = config?.commands?.preview;

  if (previewMode === "static") {
    return startStaticPreview(projectPath);
  }

  if (previewMode === "dev-server") {
    const command = config?.commands?.run;
    if (!command) return { ok: false, error: "Aucune commande de serveur de développement n'est définie dans .pcn." };

    const dependencies = await ensureProjectDependencies(projectPath);
    if (!dependencies.ok) return dependencies;

    return startDevServerPreview(projectPath, command);
  }

  return { ok: false, error: "Aucune preview n'est configurée pour ce projet." };
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
  ipcMain.handle("projects:search", (_event, { projectPath, query, options }) => searchProject(projectPath, query, options));

  ipcMain.handle("terminal:shells", () => getShells());
  ipcMain.handle("terminal:create", (_event, { projectPath, shell: requestedShell, cols, rows }) => createTerminal(projectPath, requestedShell, cols, rows));
  ipcMain.handle("terminal:write", (_event, { terminalId, data }) => {
    const terminal = terminals.get(terminalId);
    if (!terminal) return false;
    terminal.write(data);
    return true;
  });
  ipcMain.handle("terminal:resize", (_event, { terminalId, cols, rows }) => {
    const terminal = terminals.get(terminalId);
    if (!terminal) return false;
    terminal.resize(Math.max(20, Number(cols) || 80), Math.max(5, Number(rows) || 24));
    return true;
  });
  ipcMain.handle("terminal:kill", (_event, terminalId) => {
    try { terminals.get(terminalId)?.kill(); } catch {}
    terminals.delete(terminalId);
    return true;
  });

  ipcMain.handle("git:status", async (_event, projectPath) => {
    try {
      const { stdout } = await runProcess("git", ["status", "--porcelain=v1", "--branch"], projectPath);
      return { ok: true, output: stdout };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("git:init", async (_event, projectPath) => {
    try {
      const { stdout, stderr } = await runProcess("git", ["init"], projectPath);
      return { ok: true, output: stdout || stderr };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("git:add-all", async (_event, projectPath) => {
    try {
      await runProcess("git", ["add", "-A"], projectPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("git:commit", async (_event, { projectPath, message }) => {
    const clean = String(message || "").trim();
    if (!clean) return { ok: false, error: "Message de commit vide." };
    try {
      const { stdout, stderr } = await runProcess("git", ["commit", "-m", clean], projectPath);
      return { ok: true, output: stdout || stderr };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("git:pull", async (_event, projectPath) => {
    try {
      const { stdout, stderr } = await runProcess("git", ["pull"], projectPath);
      return { ok: true, output: stdout || stderr };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("git:push", async (_event, projectPath) => {
    try {
      const { stdout, stderr } = await runProcess("git", ["push"], projectPath);
      return { ok: true, output: stdout || stderr };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
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

  ipcMain.handle("ai:ask", (_event, payload) => supabaseService.askAi(payload));
  ipcMain.handle("ai:threads", (_event, projectId) => supabaseService.listAiThreads(projectId));
  ipcMain.handle("ai:messages", (_event, threadId) => supabaseService.listAiMessages(threadId));

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
  for (const child of terminals.values()) {
    try { child.kill(); } catch {}
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
