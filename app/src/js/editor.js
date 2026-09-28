(() => {
  const state = {
    project: null,
    tree: [],
    openFiles: new Map(),
    activeFile: null,
    editor: null,
    monaco: null,
    saveTimer: null,
    terminals: new Map(),
    activeTerminal: null,
    previewUrl: null,
    settings: null
  };

  const languageMap = {
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    py: "python",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    sql: "sql"
  };

  function icon(name) {
    return window.CodeNostIcons.svg(name);
  }

  async function init(settings) {
    state.settings = settings;
    await initMonaco();
    bind();
    applySettings(settings);
  }

  function initMonaco() {
    return new Promise(resolve => {
      window.require.config({ paths: { vs: "../node_modules/monaco-editor/min/vs" } });
      window.require(["vs/editor/editor.main"], () => {
        state.monaco = window.monaco;
        state.editor = monaco.editor.create(document.getElementById("monacoEditor"), {
          value: "",
          language: "plaintext",
          theme: "vs-dark",
          automaticLayout: true,
          fontSize: state.settings?.fontSize || 14,
          fontFamily: state.settings?.fontFamily || "Consolas, monospace",
          lineNumbers: state.settings?.lineNumbers === false ? "off" : "on",
          minimap: { enabled: Boolean(state.settings?.minimap) },
          breadcrumbs: { enabled: false },
          tabSize: 2,
          insertSpaces: true,
          renderWhitespace: "selection",
          smoothScrolling: true,
          padding: { top: 8 },
          scrollBeyondLastLine: false
        });

        state.editor.onDidChangeModelContent(() => {
          const file = currentFile();
          if (!file) return;
          file.dirty = true;
          renderTabs();
          if (state.settings?.autoSave) scheduleSave();
        });

        state.editor.onDidChangeCursorPosition(event => {
          document.getElementById("statusCursor").textContent = `Ln ${event.position.lineNumber}, Col ${event.position.column}`;
        });

        state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveActiveFile());
        resolve();
      });
    });
  }

  function applySettings(settings) {
    state.settings = settings;
    if (!state.editor || !state.monaco) return;

    state.editor.updateOptions({
      fontSize: settings.fontSize || 14,
      fontFamily: settings.fontFamily || "Consolas, monospace",
      lineNumbers: settings.lineNumbers === false ? "off" : "on",
      minimap: { enabled: Boolean(settings.minimap) }
    });

    monaco.editor.setTheme(settings.theme === "light" ? "vs" : "vs-dark");
    document.getElementById("breadcrumbs").classList.toggle("is-hidden", settings.breadcrumbs === false);
  }

  async function openProject(project) {
    await closeProject(false);
    state.project = project;
    document.getElementById("projectRootName").textContent = (project.name || "PROJET").toUpperCase();
    document.getElementById("statusProject").lastElementChild.textContent = project.name || "Projet";
    document.getElementById("statusSync").textContent = project.config?.cloud?.enabled ? "Cloud en attente" : "Hors ligne";

    await refreshTree();
    window.CodeNostUI.showEditor(project.name);
    await ensureTerminal();
    clearPreview();
  }

  async function closeProject(showHome = true) {
    await saveAll();

    for (const terminal of state.terminals.values()) {
      try {
        await window.codenost.terminal.kill(terminal.id);
      } catch {}
    }

    state.terminals.clear();
    state.activeTerminal = null;
    state.project = null;
    state.tree = [];
    state.openFiles.clear();
    state.activeFile = null;
    renderTabs();
    renderTree();
    clearEditor();
    await window.codenost.preview.stop();
    clearPreview();

    if (showHome) {
      window.CodeNostUI.showHome();
      await window.CodeNostProjects.refresh();
    }
  }

  async function refreshTree() {
    if (!state.project) return;
    state.tree = await window.codenost.projects.readTree(state.project.path);
    renderTree();
  }

  function renderTree() {
    const host = document.getElementById("fileTree");
    host.innerHTML = "";

    function addNodes(nodes, depth = 0) {
      for (const item of nodes) {
        const row = document.createElement("div");
        row.className = "tree-row" + (item.path === state.activeFile ? " is-active" : "");
        row.dataset.path = item.path;
        row.dataset.type = item.type;
        row.innerHTML = `
          <span class="tree-indent" style="width:${depth * 12}px"></span>
          <span class="tree-chevron">${item.type === "folder" ? icon("chevron-down") : ""}</span>
          <span class="tree-icon">${icon(item.type === "folder" ? "folder" : "file")}</span>
          <span class="tree-name">${escapeHtml(item.name)}</span>
        `;

        if (item.type === "file") {
          row.addEventListener("dblclick", () => openFile(item.path));
          row.addEventListener("click", () => openFile(item.path));
        } else {
          let expanded = true;
          const children = [];
          row.addEventListener("click", () => {
            expanded = !expanded;
            row.querySelector(".tree-chevron").innerHTML = icon(expanded ? "chevron-down" : "chevron-right");
            children.forEach(child => child.classList.toggle("is-hidden", !expanded));
          });

          const startCount = host.children.length;
          host.appendChild(row);
          addNodes(item.children || [], depth + 1);
          for (let i = startCount + 1; i < host.children.length; i++) children.push(host.children[i]);
          continue;
        }

        host.appendChild(row);
      }
    }

    addNodes(state.tree);
  }

  async function openFile(relativePath) {
    if (!state.project || !relativePath) return;

    if (!state.openFiles.has(relativePath)) {
      try {
        const content = await window.codenost.projects.readFile(state.project.path, relativePath);
        const uri = monaco.Uri.parse("file:///" + state.project.path.replace(/\\/g, "/") + "/" + relativePath);
        let model = monaco.editor.getModel(uri);
        if (!model) {
          model = monaco.editor.createModel(content, languageFromPath(relativePath), uri);
        }

        state.openFiles.set(relativePath, {
          path: relativePath,
          model,
          dirty: false,
          savedValue: content
        });
      } catch (error) {
        window.CodeNostUI.notify("Impossible d'ouvrir ce fichier : " + (error.message || error), "error");
        return;
      }
    }

    state.activeFile = relativePath;
    const file = state.openFiles.get(relativePath);
    state.editor.setModel(file.model);
    document.getElementById("editorWelcome").classList.add("is-hidden");

    renderTabs();
    renderTree();
    renderBreadcrumbs();
    updateStatus();
    state.editor.focus();
  }

  function currentFile() {
    return state.activeFile ? state.openFiles.get(state.activeFile) : null;
  }

  function renderTabs() {
    const host = document.getElementById("editorTabs");
    host.innerHTML = "";

    for (const [path, file] of state.openFiles) {
      const tab = document.createElement("button");
      tab.className = "editor-tab" + (path === state.activeFile ? " is-active" : "");
      tab.type = "button";
      const name = path.split("/").pop();
      tab.innerHTML = `
        <span class="editor-tab-name">${escapeHtml(name)}</span>
        ${file.dirty ? '<span class="editor-tab-dirty"></span>' : ""}
        <span class="editor-tab-close">${icon("x")}</span>
      `;

      tab.addEventListener("click", event => {
        if (event.target.closest(".editor-tab-close")) {
          event.stopPropagation();
          closeFile(path);
        } else {
          activateExistingFile(path);
        }
      });
      host.appendChild(tab);
    }
  }

  function activateExistingFile(path) {
    const file = state.openFiles.get(path);
    if (!file) return;
    state.activeFile = path;
    state.editor.setModel(file.model);
    document.getElementById("editorWelcome").classList.add("is-hidden");
    renderTabs();
    renderTree();
    renderBreadcrumbs();
    updateStatus();
  }

  async function closeFile(path) {
    const file = state.openFiles.get(path);
    if (!file) return;
    if (file.dirty) await saveFile(path);

    const keys = [...state.openFiles.keys()];
    const index = keys.indexOf(path);
    state.openFiles.delete(path);
    file.model.dispose();

    if (state.activeFile === path) {
      const next = keys[index + 1] || keys[index - 1];
      state.activeFile = null;
      if (next && state.openFiles.has(next)) activateExistingFile(next);
      else clearEditor();
    }

    renderTabs();
    renderTree();
  }

  function clearEditor() {
    if (state.editor) state.editor.setModel(null);
    state.activeFile = null;
    document.getElementById("editorWelcome")?.classList.remove("is-hidden");
    document.getElementById("breadcrumbs").innerHTML = "";
    document.getElementById("statusLanguage").textContent = "Texte";
    document.getElementById("statusCursor").textContent = "Ln 1, Col 1";
  }

  function renderBreadcrumbs() {
    const host = document.getElementById("breadcrumbs");
    if (!state.activeFile) {
      host.innerHTML = "";
      return;
    }

    const parts = state.activeFile.split("/");
    host.innerHTML = parts.map((part, index) => {
      const separator = index < parts.length - 1 ? icon("chevron-right") : "";
      return `<span class="breadcrumb-item">${escapeHtml(part)}${separator}</span>`;
    }).join("");
  }

  function updateStatus() {
    const language = languageFromPath(state.activeFile);
    document.getElementById("statusLanguage").textContent = languageLabel(language);
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveActiveFile(), 700);
  }

  async function saveActiveFile() {
    if (!state.activeFile) return;
    return saveFile(state.activeFile);
  }

  async function saveFile(path) {
    const file = state.openFiles.get(path);
    if (!file || !state.project) return;
    const value = file.model.getValue();

    try {
      await window.codenost.projects.writeFile(state.project.path, path, value);
      file.savedValue = value;
      file.dirty = false;
      renderTabs();

      if (state.settings?.previewAutoReload && state.previewUrl) {
        reloadPreview();
      }
    } catch (error) {
      window.CodeNostUI.notify("Erreur de sauvegarde : " + (error.message || error), "error");
    }
  }

  async function saveAll() {
    for (const path of state.openFiles.keys()) {
      if (state.openFiles.get(path)?.dirty) await saveFile(path);
    }
  }

  async function createEntry(type) {
    if (!state.project) return;
    const value = await window.CodeNostUI.promptText({
      title: type === "file" ? "Nouveau fichier" : "Nouveau dossier",
      label: "Chemin relatif",
      confirm: "Créer"
    });
    if (!value) return;

    try {
      if (type === "file") {
        await window.codenost.projects.createFile(state.project.path, value);
      } else {
        await window.codenost.projects.createFolder(state.project.path, value);
      }
      await refreshTree();
      if (type === "file") await openFile(value.replace(/\\/g, "/"));
    } catch (error) {
      window.CodeNostUI.notify(error.message || String(error), "error");
    }
  }

  async function ensureTerminal() {
    if (!state.project || state.terminals.size) return;
    await createTerminal();
  }

  async function createTerminal() {
    if (!state.project) return null;
    try {
      const available = await window.codenost.terminal.shells();
      const result = await window.codenost.terminal.create(state.project.path, available[0]?.id);
      const TerminalClass = window.Terminal;
      const FitAddonClass = window.FitAddon?.FitAddon;

      if (!TerminalClass || !FitAddonClass) {
        throw new Error("xterm.js n'a pas pu être chargé.");
      }

      const terminal = new TerminalClass({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        theme: {
          background: "#0d1016",
          foreground: "#cbd2df",
          cursor: "#7e9cff",
          selectionBackground: "#2d3d66"
        }
      });
      const fit = new FitAddonClass();
      terminal.loadAddon(fit);

      const host = document.getElementById("terminalHost");
      const container = document.createElement("div");
      container.className = "terminal-instance is-hidden";
      container.dataset.terminalId = result.id;
      host.appendChild(container);
      terminal.open(container);

      state.terminals.set(result.id, { id: result.id, title: result.shell, terminal, fit, container });
      state.activeTerminal = result.id;
      renderTerminalTabs();
      mountActiveTerminal();

      terminal.onData(data => {
        window.codenost.terminal.write(result.id, data);
      });

      window.CodeNostUI.selectBottom("terminal");
      return result.id;
    } catch (error) {
      appendOutput("Terminal indisponible : " + (error.message || error));
      window.CodeNostUI.selectBottom("output");
      return null;
    }
  }

  function renderTerminalTabs() {
    const host = document.getElementById("terminalTabs");
    host.innerHTML = "";
    for (const [id, item] of state.terminals) {
      const button = document.createElement("button");
      button.className = "terminal-tab" + (id === state.activeTerminal ? " is-active" : "");
      button.textContent = item.title || id;
      button.addEventListener("click", () => {
        state.activeTerminal = id;
        renderTerminalTabs();
        mountActiveTerminal();
      });
      host.appendChild(button);
    }
  }

  function mountActiveTerminal() {
    for (const [id, item] of state.terminals) {
      item.container?.classList.toggle("is-hidden", id !== state.activeTerminal);
    }

    const item = state.terminals.get(state.activeTerminal);
    if (!item) return;
    setTimeout(() => {
      item.fit.fit();
      item.terminal.focus();
    }, 0);
  }

  function handleTerminalData(payload) {
    const item = state.terminals.get(payload.id);
    item?.terminal.write(payload.data);
  }

  function handleTerminalExit(payload) {
    const item = state.terminals.get(payload.id);
    if (item) item.terminal.write(`\r\n[Processus terminé : ${payload.code}]\r\n`);
  }

  async function runProjectCommand(kind = "run") {
    if (!state.project) return;
    const config = await window.codenost.projects.readConfig(state.project.path);
    const command = config?.commands?.[kind];

    if (!command) {
      window.CodeNostUI.notify(
        kind === "build"
          ? "Aucune commande build n'est définie dans le .pcn."
          : "Aucune commande run n'est définie dans le .pcn.",
        "error"
      );
      return;
    }

    let terminalId = state.activeTerminal;
    if (!terminalId || !state.terminals.has(terminalId)) {
      terminalId = await createTerminal();
    }
    if (!terminalId) return;

    window.CodeNostUI.selectBottom("terminal");
    await window.codenost.terminal.write(terminalId, command + "\n");
    appendOutput(`Commande ${kind}: ${command}`);
  }

  async function startPreview() {
    if (!state.project) return;
    try {
      const result = await window.codenost.preview.start(state.project.path);
      if (!result.ok) {
        window.CodeNostUI.notify(result.error, "error");
        appendOutput(result.error);
        return;
      }

      state.previewUrl = result.url;
      const frame = document.getElementById("previewFrame");
      frame.src = result.url;
      document.getElementById("previewShell").classList.add("has-preview");
      window.CodeNostUI.selectRight("preview");
    } catch (error) {
      window.CodeNostUI.notify(error.message || String(error), "error");
    }
  }

  function reloadPreview() {
    const frame = document.getElementById("previewFrame");
    if (!state.previewUrl) return;
    frame.src = state.previewUrl + "?r=" + Date.now();
  }

  function clearPreview() {
    state.previewUrl = null;
    document.getElementById("previewFrame").src = "about:blank";
    document.getElementById("previewShell")?.classList.remove("has-preview");
  }

  function setPreviewDevice(device) {
    const shell = document.getElementById("previewShell");
    shell.classList.remove("device-desktop", "device-tablet", "device-phone");
    shell.classList.add("device-" + device);
    document.querySelectorAll(".device-button").forEach(button => {
      button.classList.toggle("is-active", button.dataset.device === device);
    });
  }

  async function openPcn() {
    if (!state.project) return;
    await openFile(".pcn");
  }

  function appendOutput(message) {
    const output = document.getElementById("outputView");
    const time = new Date().toLocaleTimeString("fr-FR");
    output.textContent += `[${time}] ${message}\n`;
    output.scrollTop = output.scrollHeight;
  }

  function flattenTree(nodes, out = []) {
    for (const item of nodes || []) {
      if (item.type === "file") out.push(item.path);
      if (item.type === "folder") flattenTree(item.children || [], out);
    }
    return out;
  }

  function getProjectId() {
    if (!state.project) return null;
    if (state.project.config?.cloud?.projectId) return state.project.config.cloud.projectId;
    if (String(state.project.path || "").startsWith("cloud://")) {
      return String(state.project.path).slice("cloud://".length);
    }
    return null;
  }

  async function buildAiContext() {
    if (!state.project) {
      return {
        platform: window.codenost.platform,
        project: null,
        activeFile: null,
        files: {},
        tree: [],
        output: "",
        problems: ""
      };
    }

    await saveAll();

    let config = {};
    try {
      config = await window.codenost.projects.readConfig(state.project.path);
    } catch {}

    const paths = flattenTree(state.tree);
    const ordered = state.activeFile
      ? [state.activeFile, ...paths.filter(path => path !== state.activeFile)]
      : paths;

    const files = {};
    let total = 0;
    const maxTotal = 100000;
    const maxPerFile = 20000;

    for (const filePath of ordered) {
      if (total >= maxTotal) break;

      try {
        const content = await window.codenost.projects.readFile(state.project.path, filePath);
        if (typeof content !== "string") continue;

        const remaining = Math.max(0, maxTotal - total);
        const limit = Math.min(maxPerFile, remaining);
        files[filePath] = content.length > limit
          ? content.slice(0, limit) + "\n/* ... contenu tronqué par CodeNost ... */"
          : content;
        total += files[filePath].length;
      } catch {}
    }

    return {
      platform: window.codenost.platform,
      project: {
        name: state.project.name,
        path: state.project.path,
        type: config?.type || state.project.config?.type || null,
        config
      },
      activeFile: state.activeFile,
      files,
      tree: paths,
      output: (document.getElementById("outputView")?.textContent || "").slice(-6000),
      problems: (document.getElementById("problemsView")?.textContent || "").slice(-4000)
    };
  }

  async function getAiActionPreview(action) {
    if (!action || !state.project) return null;

    if (action.type === "write_file") {
      let before = "";
      let exists = true;
      try {
        before = await window.codenost.projects.readFile(state.project.path, action.path);
      } catch {
        exists = false;
      }
      return {
        type: action.type,
        path: action.path,
        before,
        after: action.content || "",
        exists
      };
    }

    if (action.type === "delete_file") {
      let before = "";
      try {
        before = await window.codenost.projects.readFile(state.project.path, action.path);
      } catch {}
      return {
        type: action.type,
        path: action.path,
        before,
        after: "",
        exists: true
      };
    }

    if (action.type === "create_folder") {
      return {
        type: action.type,
        path: action.path,
        before: "",
        after: "Créer le dossier " + action.path,
        exists: false
      };
    }

    if (action.type === "terminal") {
      return {
        type: action.type,
        path: "",
        before: "",
        after: action.command || "",
        exists: false
      };
    }

    return null;
  }

  async function runTerminalCommand(command) {
    if (!state.project || !command) return false;

    let terminalId = state.activeTerminal;
    if (!terminalId || !state.terminals.has(terminalId)) {
      terminalId = await createTerminal();
    }

    if (!terminalId) {
      window.CodeNostUI.notify("Le terminal système n'est pas disponible sur cette plateforme.", "error");
      return false;
    }

    window.CodeNostUI.selectBottom("terminal");
    await window.codenost.terminal.write(terminalId, command + "\n");
    appendOutput("Commande IA: " + command);
    return true;
  }

  async function applyAiAction(action) {
    if (!state.project || !action) {
      throw new Error("Aucun projet ouvert.");
    }

    if (action.type === "write_file") {
      await window.codenost.projects.writeFile(
        state.project.path,
        action.path,
        action.content || ""
      );

      const open = state.openFiles.get(action.path);
      if (open) {
        open.model.setValue(action.content || "");
        open.savedValue = action.content || "";
        open.dirty = false;
      }

      await refreshTree();
      renderTabs();

      if (state.activeFile === action.path) {
        renderBreadcrumbs();
        updateStatus();
      }

      if (state.previewUrl && state.settings?.previewAutoReload) {
        reloadPreview();
      }

      return { ok: true };
    }

    if (action.type === "delete_file") {
      await window.codenost.projects.deleteEntry(state.project.path, action.path);

      const open = state.openFiles.get(action.path);
      if (open) {
        try { open.model.dispose(); } catch {}
        state.openFiles.delete(action.path);
        if (state.activeFile === action.path) clearEditor();
      }

      await refreshTree();
      renderTabs();
      return { ok: true };
    }

    if (action.type === "create_folder") {
      try {
        await window.codenost.projects.createFolder(state.project.path, action.path);
      } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes("existe")) throw error;
      }
      await refreshTree();
      return { ok: true };
    }

    if (action.type === "terminal") {
      return { ok: await runTerminalCommand(action.command) };
    }

    throw new Error("Action IA inconnue.");
  }

  function bind() {
    document.getElementById("newFileButton").addEventListener("click", () => createEntry("file"));
    document.getElementById("newFolderButton").addEventListener("click", () => createEntry("folder"));
    document.getElementById("refreshTreeButton").addEventListener("click", refreshTree);
    document.getElementById("newTerminalButton").addEventListener("click", createTerminal);
    document.getElementById("startPreviewButton").addEventListener("click", startPreview);
    document.getElementById("reloadPreview").addEventListener("click", reloadPreview);

    document.getElementById("openPreviewExternal").addEventListener("click", () => {
      if (state.previewUrl) window.codenost.preview.openWindow(state.previewUrl);
    });

    document.querySelectorAll(".device-button").forEach(button => {
      button.addEventListener("click", () => setPreviewDevice(button.dataset.device));
    });

    window.codenost.terminal.onData(handleTerminalData);
    window.codenost.terminal.onExit(handleTerminalExit);

    window.addEventListener("resize", () => {
      const item = state.terminals.get(state.activeTerminal);
      try { item?.fit.fit(); } catch {}
    });
  }

  function languageFromPath(filePath = "") {
    const ext = filePath.split(".").pop().toLowerCase();
    return languageMap[ext] || "plaintext";
  }

  function languageLabel(language) {
    return ({
      plaintext: "Texte",
      javascript: "JavaScript",
      typescript: "TypeScript",
      html: "HTML",
      css: "CSS",
      scss: "SCSS",
      json: "JSON",
      markdown: "Markdown",
      python: "Python",
      xml: "XML",
      yaml: "YAML",
      shell: "Shell",
      powershell: "PowerShell",
      sql: "SQL"
    })[language] || language;
  }

  function escapeHtml(value) {
    return window.CodeNostUI.escapeHtml(value);
  }

  window.CodeNostEditor = {
    state,
    init,
    applySettings,
    openProject,
    closeProject,
    openFile,
    openPcn,
    saveActiveFile,
    saveAll,
    createTerminal,
    runProjectCommand,
    runTerminalCommand,
    buildAiContext,
    getProjectId,
    getAiActionPreview,
    applyAiAction,
    startPreview,
    appendOutput
  };
})();
