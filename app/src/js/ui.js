(() => {
  const state = {
    settings: null,
    menuOpen: null
  };

  const menus = {
    file: [
      { label: "Nouveau projet", action: "new-project", shortcut: "Ctrl+Shift+N" },
      { label: "Importer un dossier", action: "import-project" },
      { separator: true },
      { label: "Enregistrer", action: "save", shortcut: "Ctrl+S" },
      { label: "Fermer le projet", action: "close-project" }
    ],
    edit: [
      { label: "Annuler", action: "undo", shortcut: "Ctrl+Z" },
      { label: "Rétablir", action: "redo", shortcut: "Ctrl+Y" },
      { separator: true },
      { label: "Rechercher", action: "find", shortcut: "Ctrl+F" }
    ],
    view: [
      { label: "Explorateur", action: "toggle-sidebar" },
      { label: "Panneau inférieur", action: "toggle-bottom" },
      { label: "Preview / IA", action: "toggle-right" },
      { separator: true },
      { label: "Paramètres", action: "settings", shortcut: "Ctrl+," }
    ],
    project: [
      { label: "Exécuter", action: "run-project", shortcut: "F5" },
      { label: "Build", action: "build-project" },
      { label: "Lancer la preview", action: "preview" },
      { separator: true },
      { label: "Ouvrir la configuration .pcn", action: "open-pcn" },
      { label: "Synchroniser", action: "sync", disabled: true }
    ],
    terminal: [
      { label: "Nouveau terminal", action: "new-terminal", shortcut: "Ctrl+Shift+ù" },
      { label: "Masquer / afficher", action: "toggle-bottom" }
    ],
    help: [
      { label: "Documentation", action: "docs" },
      { label: "Site CodeNost", action: "website" },
      { separator: true },
      { label: "À propos", action: "about" }
    ]
  };

  function setSettings(settings) {
    state.settings = settings;
    applySettings(settings);
  }

  function applySettings(settings) {
    const app = document.getElementById("app");
    if (!app || !settings) return;

    app.classList.toggle("theme-light", settings.theme === "light");
    app.classList.toggle("theme-dark", settings.theme !== "light");
    document.documentElement.style.setProperty("--editor-font-size", (settings.fontSize || 14) + "px");

    const breadcrumbs = document.getElementById("breadcrumbs");
    breadcrumbs?.classList.toggle("is-hidden", settings.breadcrumbs === false);
  }

  function showHome() {
    document.getElementById("homeView")?.classList.remove("is-hidden");
    document.getElementById("editorView")?.classList.add("is-hidden");
    document.getElementById("windowTitle").textContent = "Accueil";
  }

  function showEditor(title) {
    document.getElementById("homeView")?.classList.add("is-hidden");
    document.getElementById("editorView")?.classList.remove("is-hidden");
    document.getElementById("windowTitle").textContent = title || "Éditeur";
  }

  function showAuth() {
    document.getElementById("authView")?.classList.remove("is-hidden");
    document.getElementById("mainView")?.classList.add("is-hidden");
  }

  function showMain() {
    document.getElementById("authView")?.classList.add("is-hidden");
    document.getElementById("mainView")?.classList.remove("is-hidden");
  }

  function toggleSidebar(force) {
    const hidden = force ?? !document.body.classList.contains("sidebar-hidden");
    document.body.classList.toggle("sidebar-hidden", hidden);
  }

  function toggleRight(force) {
    const hidden = force ?? !document.body.classList.contains("right-hidden");
    document.body.classList.toggle("right-hidden", hidden);
  }

  function toggleBottom(force) {
    const panel = document.getElementById("bottomPanel");
    if (!panel) return;
    const collapsed = force ?? !panel.classList.contains("is-collapsed");
    panel.classList.toggle("is-collapsed", collapsed);
  }

  function selectBottom(name) {
    document.querySelectorAll(".bottom-tab").forEach(button => {
      button.classList.toggle("is-active", button.dataset.bottom === name);
    });
    document.querySelectorAll(".bottom-view").forEach(view => {
      view.classList.toggle("is-active", view.dataset.bottomView === name);
    });
    document.getElementById("bottomPanel")?.classList.remove("is-collapsed");
  }

  function selectRight(name) {
    document.querySelectorAll(".right-tab").forEach(button => {
      button.classList.toggle("is-active", button.dataset.right === name);
    });
    document.querySelectorAll(".right-view").forEach(view => {
      view.classList.toggle("is-active", view.dataset.rightView === name);
    });
    document.getElementById("previewToolbar")?.classList.toggle("is-hidden", name !== "preview");
  }

  function selectSidebar(name) {
    document.querySelectorAll(".activity-button[data-sidebar]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.sidebar === name);
    });
    document.querySelectorAll(".sidebar-view").forEach(view => {
      view.classList.toggle("is-active", view.dataset.sidebarView === name);
    });
    document.body.classList.remove("sidebar-hidden");
  }

  function openMenu(name, trigger) {
    const layer = document.getElementById("menuLayer");
    if (!layer) return;

    if (state.menuOpen === name && !layer.classList.contains("is-hidden")) {
      closeMenu();
      return;
    }

    state.menuOpen = name;
    document.querySelectorAll(".menu-trigger").forEach(btn => btn.classList.toggle("is-active", btn === trigger));

    layer.innerHTML = "";
    for (const item of menus[name] || []) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "menu-separator";
        layer.appendChild(sep);
        continue;
      }

      const button = document.createElement("button");
      button.className = "menu-item";
      button.type = "button";
      button.disabled = Boolean(item.disabled);
      button.dataset.action = item.action;
      button.innerHTML = `<span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.shortcut || "")}</small>`;
      layer.appendChild(button);
    }

    const rect = trigger.getBoundingClientRect();
    layer.style.left = Math.max(5, rect.left) + "px";
    layer.classList.remove("is-hidden");
  }

  function closeMenu() {
    state.menuOpen = null;
    document.getElementById("menuLayer")?.classList.add("is-hidden");
    document.querySelectorAll(".menu-trigger").forEach(btn => btn.classList.remove("is-active"));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function notify(message, type = "info") {
    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:1000;display:flex;flex-direction:column;gap:7px";
      document.body.appendChild(host);
    }

    const item = document.createElement("div");
    item.style.cssText = "min-width:240px;max-width:420px;padding:9px 11px;border:1px solid var(--line-strong);background:var(--panel-2);box-shadow:var(--shadow);border-radius:6px;color:var(--text-soft);font-size:12px";
    if (type === "error") item.style.borderColor = "var(--danger)";
    if (type === "success") item.style.borderColor = "var(--success)";
    item.textContent = message;
    host.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  function promptText({ title, label, value = "", confirm = "Créer" }) {
    return new Promise(resolve => {
      const dialog = document.getElementById("textPromptDialog");
      const form = document.getElementById("textPromptForm");
      const input = document.getElementById("textPromptInput");
      const titleNode = document.getElementById("textPromptTitle");
      const labelNode = document.getElementById("textPromptLabel");
      const confirmNode = document.getElementById("textPromptConfirm");

      titleNode.textContent = title;
      labelNode.textContent = label;
      confirmNode.textContent = confirm;
      input.value = value;

      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        form.removeEventListener("submit", onSubmit);
        dialog.removeEventListener("close", onClose);
        resolve(result);
      };
      const onSubmit = event => {
        event.preventDefault();
        const result = input.value.trim();
        if (!result) return;
        dialog.close();
        finish(result);
      };
      const onClose = () => finish(null);

      form.addEventListener("submit", onSubmit);
      dialog.addEventListener("close", onClose);
      dialog.showModal();
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    });
  }

  function bind() {
    document.querySelectorAll(".menu-trigger").forEach(trigger => {
      trigger.addEventListener("click", event => {
        event.stopPropagation();
        openMenu(trigger.dataset.menu, trigger);
      });
    });

    document.addEventListener("click", event => {
      if (!event.target.closest("#menuLayer") && !event.target.closest(".menu-trigger")) closeMenu();
    });

    document.querySelectorAll(".bottom-tab").forEach(btn => {
      btn.addEventListener("click", () => selectBottom(btn.dataset.bottom));
    });
    document.querySelectorAll(".right-tab").forEach(btn => {
      btn.addEventListener("click", () => selectRight(btn.dataset.right));
    });
    document.querySelectorAll(".activity-button[data-sidebar]").forEach(btn => {
      btn.addEventListener("click", () => selectSidebar(btn.dataset.sidebar));
    });

    document.getElementById("toggleBottomPanel")?.addEventListener("click", () => toggleBottom());
    document.getElementById("toggleRightPanel")?.addEventListener("click", () => toggleRight());
  }

  window.CodeNostUI = {
    state,
    bind,
    setSettings,
    applySettings,
    showHome,
    showEditor,
    showAuth,
    showMain,
    toggleSidebar,
    toggleRight,
    toggleBottom,
    selectBottom,
    selectRight,
    selectSidebar,
    closeMenu,
    notify,
    promptText,
    escapeHtml
  };
})();
