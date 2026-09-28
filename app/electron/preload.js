const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codenost", {
  platform: process.platform,

  auth: {
    status: () => ipcRenderer.invoke("auth:status"),
    login: (payload) => ipcRenderer.invoke("auth:login", payload),
    logout: () => ipcRenderer.invoke("auth:logout"),
    openSignup: () => ipcRenderer.invoke("auth:open-signup")
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
    writeConfig: (projectPath, config) => ipcRenderer.invoke("projects:write-config", { projectPath, config })
  },

  terminal: {
    create: (projectPath, shell) => ipcRenderer.invoke("terminal:create", { projectPath, shell }),
    write: (terminalId, data) => ipcRenderer.invoke("terminal:write", { terminalId, data }),
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
    openWindow: (url) => ipcRenderer.invoke("preview:open-window", url)
  },

  settings: {
    read: () => ipcRenderer.invoke("settings:read"),
    write: (settings) => ipcRenderer.invoke("settings:write", settings)
  },

  system: {
    openExternal: (url) => ipcRenderer.invoke("system:open-external", url)
  }
});
