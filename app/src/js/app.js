(() => {
  const state = {
    settings: null,
    auth: null
  };

  async function boot() {
    window.CodeNostIcons.render();
    window.CodeNostUI.bind();

    state.settings = await window.codenost.settings.read();
    window.CodeNostUI.setSettings(state.settings);
    window.CodeNostExtensions?.init(state.settings);
    await window.CodeNostEditor.init(state.settings);

    await window.CodeNostProjects.init({
      onOpen: project => window.CodeNostEditor.openProject(project)
    });

    bindAuth();
    bindMenus();
    bindSettings();
    bindHome();
    bindGlobalShortcuts();
    window.CodeNostAI?.init();

    state.auth = await window.codenost.auth.status();
    applyAuthState(state.auth);

    window.codenost.auth.onChanged?.(auth => {
      if (auth?.error) {
        document.getElementById("authMessage").textContent = auth.error;
        return;
      }
      applyAuthState(auth);
    });
  }

  function applyAuthState(auth) {
    state.auth = auth;
    if (auth.authenticated) {
      window.CodeNostUI.showMain();
      window.CodeNostUI.showHome();
      const label = document.getElementById("accountLabel");
      label.textContent = auth.user?.email || (auth.devBypass ? "Développement" : "Compte");
      document.getElementById("authMessage").textContent = "";
      window.CodeNostAI?.refreshHistory();
    } else {
      window.CodeNostUI.showAuth();
    }
  }

  function bindAuth() {
    const password = document.getElementById("loginPassword");
    const toggle = document.getElementById("toggleLoginPassword");

    toggle.addEventListener("click", () => {
      const visible = password.type === "text";
      password.type = visible ? "password" : "text";
      toggle.querySelector("[data-icon]").dataset.icon = visible ? "eye" : "eye-off";
      window.CodeNostIcons.render(toggle);
    });

    document.getElementById("loginForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.getElementById("authMessage");
      const email = document.getElementById("loginEmail").value.trim();
      const passwordValue = password.value;

      message.textContent = "Connexion…";
      try {
        const result = await window.codenost.auth.login({ email, password: passwordValue });
        if (!result.ok) {
          message.textContent = result.error || "Connexion impossible.";
          return;
        }

        message.textContent = "";
        document.getElementById("authView").style.opacity = "0";
        document.getElementById("authView").style.transition = "opacity .25s ease";
        setTimeout(() => {
          document.getElementById("authView").style.opacity = "";
          applyAuthState({ authenticated: true, user: result.user });
        }, 260);
      } catch (error) {
        message.textContent = error.message || String(error);
      }
    });

    document.getElementById("githubLogin").addEventListener("click", async () => {
      const message = document.getElementById("authMessage");
      message.textContent = "Ouverture de GitHub…";
      try {
        const result = await window.codenost.auth.githubLogin();
        if (!result?.ok) message.textContent = result?.error || "Connexion GitHub impossible.";
        else message.textContent = "Termine la connexion dans ton navigateur.";
      } catch (error) {
        message.textContent = error.message || String(error);
      }
    });

    document.getElementById("openSignup").addEventListener("click", () => window.codenost.auth.openSignup());

    document.getElementById("accountButton").addEventListener("click", () => openSettings("account"));

    document.getElementById("logoutButton").addEventListener("click", async () => {
      await window.CodeNostEditor.closeProject(false);
      await window.codenost.auth.logout();
      document.getElementById("settingsDialog").close();
      applyAuthState({ authenticated: false, user: null });
    });
  }

  function bindMenus() {
    document.getElementById("menuLayer").addEventListener("click", async event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      window.CodeNostUI.closeMenu();
      await runAction(button.dataset.action);
    });
  }

  async function runAction(action) {
    const editor = window.CodeNostEditor.state.editor;

    switch (action) {
      case "new-project":
        window.CodeNostProjects.openWizard("empty");
        break;
      case "import-project":
        await window.CodeNostProjects.importProject();
        break;
      case "save":
        await window.CodeNostEditor.saveActiveFile();
        break;
      case "close-project":
        await window.CodeNostEditor.closeProject(true);
        break;
      case "undo":
        editor?.trigger("menu", "undo", null);
        break;
      case "redo":
        editor?.trigger("menu", "redo", null);
        break;
      case "find":
        editor?.trigger("menu", "actions.find", null);
        break;
      case "toggle-sidebar":
        window.CodeNostUI.toggleSidebar();
        break;
      case "toggle-bottom":
        window.CodeNostUI.toggleBottom();
        break;
      case "toggle-right":
        window.CodeNostUI.toggleRight();
        break;
      case "settings":
        openSettings("appearance");
        break;
      case "open-pcn":
        await window.CodeNostEditor.openPcn();
        break;
      case "preview":
        await window.CodeNostEditor.startPreview();
        break;
      case "run-project":
        await window.CodeNostEditor.runProjectCommand("run");
        break;
      case "build-project":
        await window.CodeNostEditor.runProjectCommand("build");
        break;
      case "new-terminal":
        await window.CodeNostEditor.createTerminal();
        break;
      case "website":
        await window.codenost.system.openExternal("https://gabyy-1.github.io/codenost/");
        break;
      case "about":
        window.CodeNostUI.notify("CodeNost 0.1.0 — environnement de développement desktop.");
        break;
    }
  }

  function bindHome() {
    document.querySelectorAll("[data-collapse]").forEach(button => {
      button.addEventListener("click", () => {
        const id = button.dataset.collapse;
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.style.display = "none";
        document.querySelector(".home-view").style.gridTemplateColumns = "minmax(390px,1fr) 300px";
        document.getElementById("restoreHomeAi").classList.remove("is-hidden");
      });
    });

    document.getElementById("restoreHomeAi").addEventListener("click", () => {
      document.getElementById("homeAiPanel").style.display = "";
      document.querySelector(".home-view").style.gridTemplateColumns = "";
      document.getElementById("restoreHomeAi").classList.add("is-hidden");
    });

    document.getElementById("showRightPanelButton").addEventListener("click", () => {
      window.CodeNostUI.toggleRight(false);
    });

    document.getElementById("syncButton").addEventListener("click", async () => {
      const project = window.CodeNostEditor.state.project;
      if (!project) {
        window.CodeNostUI.notify("Ouvre d'abord un projet.");
        return;
      }

      document.getElementById("statusSync").textContent = "Synchronisation…";
      try {
        let result = await window.codenost.cloud.syncProject(project.path);

        if (result?.skipped) {
          document.getElementById("statusSync").textContent = "Hors ligne";
          window.CodeNostUI.notify(result.error || "Cloud désactivé.");
          return;
        }

        if (result?.conflicts?.length) {
          for (const conflict of result.conflicts) {
            const choice = await resolveCloudConflict(conflict);
            if (!choice) {
              document.getElementById("statusSync").textContent = "Conflit";
              return;
            }
            await window.codenost.cloud.resolveConflict({
              projectPath: project.path,
              projectId: result.projectId,
              conflict,
              choice
            });
          }
          result = await window.codenost.cloud.syncProject(project.path);
        }

        if (!result?.ok) throw new Error(result?.error || "Synchronisation impossible.");

        document.getElementById("statusSync").textContent = "Synchronisé";
        window.CodeNostUI.notify(`${result.files} fichier(s) synchronisé(s).`, "success");
      } catch (error) {
        document.getElementById("statusSync").textContent = "Erreur Cloud";
        window.CodeNostUI.notify(error.message || String(error), "error");
      }
    });

    document.getElementById("quickCommand").addEventListener("click", async () => {
      const command = await window.CodeNostUI.promptText({
        title: "Palette de commandes",
        label: "Commande",
        confirm: "Exécuter"
      });
      if (!command) return;

      const normalized = command.trim().toLowerCase();
      const aliases = {
        "nouveau projet": "new-project",
        "importer": "import-project",
        "enregistrer": "save",
        "fermer projet": "close-project",
        "parametres": "settings",
        "paramètres": "settings",
        "preview": "preview",
        "terminal": "new-terminal",
        "pcn": "open-pcn"
      };

      const action = aliases[normalized];
      if (!action) {
        window.CodeNostUI.notify("Commande inconnue.", "error");
        return;
      }
      await runAction(action);
    });

    document.getElementById("editorSettingsButton").addEventListener("click", () => openSettings("editor"));

    document.getElementById("aiModeSelect").addEventListener("change", async event => {
      state.settings.aiMode = event.target.value;
      await saveSettings();
    });
  }

  function resolveCloudConflict(conflict) {
    return new Promise(resolve => {
      const dialog = document.getElementById("cloudConflictDialog");
      const text = document.getElementById("cloudConflictText");
      const local = document.getElementById("keepLocalConflict");
      const cloud = document.getElementById("keepCloudConflict");

      text.textContent = conflict.path;

      const finish = choice => {
        local.removeEventListener("click", onLocal);
        cloud.removeEventListener("click", onCloud);
        dialog.removeEventListener("cancel", onCancel);
        dialog.close();
        resolve(choice);
      };
      const onLocal = () => finish("local");
      const onCloud = () => finish("remote");
      const onCancel = event => {
        event.preventDefault();
        finish(null);
      };

      local.addEventListener("click", onLocal);
      cloud.addEventListener("click", onCloud);
      dialog.addEventListener("cancel", onCancel);
      dialog.showModal();
    });
  }

  function bindSettings() {
    document.getElementById("closeSettings").addEventListener("click", () => {
      document.getElementById("settingsDialog").close();
    });

    document.querySelectorAll(".settings-nav-item").forEach(button => {
      button.addEventListener("click", () => selectSettingsPage(button.dataset.settingsPage));
    });

    const controls = {
      settingTheme: ["theme", value => value],
      settingFontSize: ["fontSize", value => Number(value)],
      settingLineNumbers: ["lineNumbers", (_value, input) => input.checked],
      settingBreadcrumbs: ["breadcrumbs", (_value, input) => input.checked],
      settingMinimap: ["minimap", (_value, input) => input.checked],
      settingAutoSave: ["autoSave", (_value, input) => input.checked],
      settingAiMode: ["aiMode", value => value],
      settingPreviewReload: ["previewAutoReload", (_value, input) => input.checked]
    };

    for (const [id, [key, convert]] of Object.entries(controls)) {
      const input = document.getElementById(id);
      const eventName = input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventName, async () => {
        state.settings[key] = convert(input.value, input);
        await saveSettings();
      });
    }
  }

  function openSettings(page = "appearance") {
    syncSettingsControls();
    selectSettingsPage(page);
    document.getElementById("settingsDialog").showModal();
  }

  function selectSettingsPage(page) {
    document.querySelectorAll(".settings-nav-item").forEach(button => {
      button.classList.toggle("is-active", button.dataset.settingsPage === page);
    });
    document.querySelectorAll(".settings-page").forEach(section => {
      section.classList.toggle("is-active", section.dataset.settingsContent === page);
    });

    const titles = {
      appearance: "Apparence",
      editor: "Éditeur",
      ai: "Intelligence artificielle",
      cloud: "Cloud",
      preview: "Preview",
      account: "Compte"
    };
    document.getElementById("settingsPageTitle").textContent = titles[page] || "Paramètres";
  }

  function syncSettingsControls() {
    document.getElementById("settingTheme").value = state.settings.theme || "dark";
    document.getElementById("settingFontSize").value = state.settings.fontSize || 14;
    document.getElementById("settingLineNumbers").checked = state.settings.lineNumbers !== false;
    document.getElementById("settingBreadcrumbs").checked = state.settings.breadcrumbs !== false;
    document.getElementById("settingMinimap").checked = Boolean(state.settings.minimap);
    document.getElementById("settingAutoSave").checked = state.settings.autoSave !== false;
    document.getElementById("settingAiMode").value = state.settings.aiMode || "review";
    document.getElementById("settingPreviewReload").checked = state.settings.previewAutoReload !== false;
    document.getElementById("aiModeSelect").value = state.settings.aiMode || "review";
    document.getElementById("settingsAccountEmail").textContent = state.auth?.user?.email || (state.auth?.devBypass ? "Mode développement" : "Compte connecté");
  }

  async function saveSettings() {
    state.settings = await window.codenost.settings.write(state.settings);
    window.CodeNostUI.setSettings(state.settings);
    window.CodeNostEditor.applySettings(state.settings);
  }

  function bindGlobalShortcuts() {
    window.addEventListener("keydown", async event => {
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        window.CodeNostProjects.openWizard("empty");
      }

      if (mod && event.key === ",") {
        event.preventDefault();
        openSettings("appearance");
      }

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        await window.CodeNostEditor.saveActiveFile();
      }

      if (event.key === "F5") {
        event.preventDefault();
        await window.CodeNostEditor.runProjectCommand("run");
      }

      if (event.key === "Escape") {
        window.CodeNostUI.closeMenu();
      }
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    boot().catch(error => {
      console.error(error);
      document.body.innerHTML = `<pre style="padding:20px;color:#ef6475;background:#0b0d12;height:100vh;margin:0;white-space:pre-wrap">CodeNost n'a pas pu démarrer.\n\n${String(error.stack || error)}</pre>`;
    });
  });
})();
