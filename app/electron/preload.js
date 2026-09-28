const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codenost", {
  platform: process.platform,

  auth: {
    status: () => ipcRenderer.invoke("auth:status"),
    login: (payload) => ipcRenderer.invoke("auth:login", payload),
    logout: () => ipcRenderer.invoke("auth:logout"),
    githubLogin: () => ipcRenderer.invoke("auth:github-login"),
    openSignup: () => ipcRenderer.invoke("auth:open-signup"),
    onChanged: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("auth:changed", handler);
      return () => ipcRenderer.removeListener("auth:changed", handler);
    }
  },

  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    chooseLocation: () => ipcRenderer.invoke("projects:choose-location"),
    create: (payload) => ipcRenderer.invoke("projects:create", payload),
    importFolder: () => ipcRenderer.invoke("projects:import-folder"),
    cloneGithub: (payload) => ipcRenderer.invoke("projects:clone-github", payload),
    open: (projectPath) => ipcRenderer.invoke("projects:open", projectPath),
    removeRecent: (projectPath) => ipcRenderer.invoke("projects:remove-recent", projectPath),
    readTree: (projectPath) => ipcRenderer.invoke("projects:read-tree", projectPath),
    readFile: (projectPath, relativePath) => ipcRenderer.invoke("projects:read-file", { projectPath, relativePath }),
    writeFile: (projectPath, relativePath, content) => ipcRenderer.invoke("projects:write-file", { projectPath, relativePath, content }),
    createFile: (projectPath, relativePath) => ipcRenderer.invoke("projects:create-file", { projectPath, relativePath }),
    createFolder: (projectPath, relativePath) => ipcRenderer.invoke("projects:create-folder", { projectPath, relativePath }),
    deleteEntry: (projectPath, relativePath) => ipcRenderer.invoke("projects:delete-entry", { projectPath, relativePath }),
    renameEntry: (projectPath, relativePath, nextRelativePath) => ipcRenderer.invoke("projects:rename-entry", { projectPath, relativePath, nextRelativePath }),
    readConfig: (projectPath) => ipcRenderer.invoke("projects:read-config", projectPath),
    writeConfig: (projectPath, config) => ipcRenderer.invoke("projects:write-config", { projectPath, config }),
    search: (projectPath, query, options) => ipcRenderer.invoke("projects:search", { projectPath, query, options })
  },

  terminal: {
    create: (projectPath, shell, size = {}) => ipcRenderer.invoke("terminal:create", { projectPath, shell, cols: size.cols, rows: size.rows }),
    write: (terminalId, data) => ipcRenderer.invoke("terminal:write", { terminalId, data }),
    resize: (terminalId, cols, rows) => ipcRenderer.invoke("terminal:resize", { terminalId, cols, rows }),
    kill: (terminalId) => ipcRenderer.invoke("terminal:kill", terminalId),
    shells: () => ipcRenderer.invoke("terminal:shells"),
    onData: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:data", handler);
      return () => ipcRenderer.removeListener("terminal:data", handler);
    },
    onExit: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:exit", handler);
      return () => ipcRenderer.removeListener("terminal:exit", handler);
    }
  },

  preview: {
    start: (projectPath) => ipcRenderer.invoke("preview:start", projectPath),
    stop: () => ipcRenderer.invoke("preview:stop"),
    openWindow: (url) => ipcRenderer.invoke("preview:open-window", url),
    onLog: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("preview:log", handler);
      return () => ipcRenderer.removeListener("preview:log", handler);
    }
  },

  git: {
    status: (projectPath) => ipcRenderer.invoke("git:status", projectPath),
    init: (projectPath) => ipcRenderer.invoke("git:init", projectPath),
    addAll: (projectPath) => ipcRenderer.invoke("git:add-all", projectPath),
    commit: (projectPath, message) => ipcRenderer.invoke("git:commit", { projectPath, message }),
    pull: (projectPath) => ipcRenderer.invoke("git:pull", projectPath),
    push: (projectPath) => ipcRenderer.invoke("git:push", projectPath)
  },

  cloud: {
    syncProject: (projectPath) => ipcRenderer.invoke("cloud:sync-project", projectPath),
    resolveConflict: (payload) => ipcRenderer.invoke("cloud:resolve-conflict", payload)
  },

  ai: {
    ask: (payload) => ipcRenderer.invoke("ai:ask", payload),
    threads: (projectId) => ipcRenderer.invoke("ai:threads", projectId),
    messages: (threadId) => ipcRenderer.invoke("ai:messages", threadId)
  },

  settings: {
    read: () => ipcRenderer.invoke("settings:read"),
    write: (settings) => ipcRenderer.invoke("settings:write", settings)
  },

  system: {
    openExternal: (url) => ipcRenderer.invoke("system:open-external", url)
  }
});
