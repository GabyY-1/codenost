(() => {
  const STORAGE_KEY = "codenost.projects.v1";
  const PREF_KEY = "codenost.preferences.v1";

  const state = {
    projects: loadProjects(),
    currentProjectId: null,
    currentFile: null,
    selectedTemplate: "empty"
  };

  const screens = [...document.querySelectorAll("[data-screen]")];
  const dashboardView = document.getElementById("dashboardView");
  const editorView = document.getElementById("editorView");
  const projectModal = document.getElementById("projectModal");
  const settingsModal = document.getElementById("settingsModal");

  function showScreen(name) {
    screens.forEach(s => s.classList.toggle("is-active", s.dataset.screen === name));
  }

  function loadProjects() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveProjects() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[ch]);
  }

  function uid() {
    return crypto?.randomUUID?.() || "p_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  function nowLabel(timestamp) {
    const d = new Date(timestamp);
    return new Intl.DateTimeFormat("fr-FR", {dateStyle:"medium", timeStyle:"short"}).format(d);
  }

  function templateFiles(template) {
    const files = {
      empty: {
        "README.md": "# Nouveau projet CodeNost\n"
      },
      static: {
        "index.html": "<!doctype html>\n<html lang=\"fr\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Mon site</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <h1>Bonjour CodeNost</h1>\n  <script src=\"script.js\"><\/script>\n</body>\n</html>\n",
        "style.css": "body {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  font-family: system-ui, sans-serif;\n}\n",
        "script.js": "console.log(\"Projet CodeNost prêt\");\n"
      },
      javascript: {
        "index.js": "function main() {\n  console.log(\"Bonjour CodeNost\");\n}\n\nmain();\n"
      },
      typescript: {
        "index.ts": "function main(): void {\n  console.log(\"Bonjour CodeNost\");\n}\n\nmain();\n",
        "tsconfig.json": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\",\n    \"strict\": true\n  }\n}\n"
      },
      python: {
        "main.py": "def main():\n    print(\"Bonjour CodeNost\")\n\n\nif __name__ == \"__main__\":\n    main()\n"
      },
      node: {
        "index.js": "console.log(\"Bonjour depuis Node.js\");\n",
        "package.json": "{\n  \"name\": \"codenost-project\",\n  \"version\": \"1.0.0\",\n  \"scripts\": {\n    \"start\": \"node index.js\"\n  }\n}\n"
      },
      react: {
        "src/App.jsx": "export default function App() {\n  return <h1>Bonjour CodeNost</h1>;\n}\n",
        "src/main.jsx": "import React from \"react\";\nimport { createRoot } from \"react-dom/client\";\nimport App from \"./App.jsx\";\n\ncreateRoot(document.getElementById(\"root\")).render(<App />);\n",
        "index.html": "<!doctype html>\n<html><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"><\/script></body></html>\n"
      },
      vite: {
        "index.html": "<!doctype html>\n<html><body><div id=\"app\"></div><script type=\"module\" src=\"/src/main.js\"><\/script></body></html>\n",
        "src/main.js": "document.querySelector(\"#app\").innerHTML = \"<h1>Bonjour Vite</h1>\";\n"
      }
    };
    return JSON.parse(JSON.stringify(files[template] || files.empty));
  }

  function templateLabel(template) {
    return ({
      empty:"Vide",
      static:"Site statique",
      javascript:"JavaScript",
      typescript:"TypeScript",
      python:"Python",
      node:"Node.js",
      react:"React",
      vite:"Vite"
    })[template] || template;
  }

  function renderProjects() {
    const list = document.getElementById("projectList");
    const empty = document.getElementById("emptyProjects");
    list.innerHTML = "";
    empty.classList.toggle("hidden", state.projects.length > 0);

    [...state.projects]
      .sort((a,b) => b.updatedAt - a.updatedAt)
      .forEach(project => {
        const card = document.createElement("article");
        card.className = "project-card";
        card.innerHTML = `
          <div class="project-main">
            <div class="project-name">${escapeHtml(project.name)}</div>
            <div class="project-meta">${escapeHtml(templateLabel(project.template))} · Modifié ${escapeHtml(nowLabel(project.updatedAt))}</div>
          </div>
          <div class="project-actions">
            <button class="btn btn-secondary btn-small" data-open="${project.id}">Ouvrir</button>
            <button class="btn btn-ghost btn-small danger" data-delete="${project.id}" title="Supprimer">×</button>
          </div>
        `;
        list.appendChild(card);
      });

    list.querySelectorAll("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => openProject(btn.dataset.open));
    });
    list.querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", () => deleteProject(btn.dataset.delete));
    });
  }

  function deleteProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;
    if (!confirm(`Supprimer le projet "${project.name}" ?`)) return;
    state.projects = state.projects.filter(p => p.id !== id);
    saveProjects();
    renderProjects();
  }

  function createProject(name, template) {
    const project = {
      id: uid(),
      name: name.trim(),
      template,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: templateFiles(template)
    };
    state.projects.push(project);
    saveProjects();
    renderProjects();
    openProject(project.id);
  }

  function currentProject() {
    return state.projects.find(p => p.id === state.currentProjectId) || null;
  }

  function openProject(id) {
    state.currentProjectId = id;
    const project = currentProject();
    if (!project) return;

    dashboardView.classList.add("hidden");
    editorView.classList.remove("hidden");
    document.getElementById("pageTitle").textContent = "Éditeur";
    document.getElementById("editorProjectName").textContent = project.name;

    const names = Object.keys(project.files);
    state.currentFile = names[0] || null;
    renderFileTree();
    renderTabs();
    loadCurrentFile();
    clearPreview();
  }

  function backToProjects() {
    saveCurrentFile();
    state.currentProjectId = null;
    state.currentFile = null;
    editorView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    document.getElementById("pageTitle").textContent = "Projets";
    renderProjects();
  }

  function renderFileTree() {
    const tree = document.getElementById("fileTree");
    const project = currentProject();
    tree.innerHTML = "";
    if (!project) return;

    Object.keys(project.files).sort().forEach(name => {
      const btn = document.createElement("button");
      btn.className = "file-item" + (name === state.currentFile ? " is-active" : "");
      btn.textContent = name;
      btn.title = name;
      btn.addEventListener("click", () => switchFile(name));
      tree.appendChild(btn);
    });
  }

  function renderTabs() {
    const tabs = document.getElementById("editorTabs");
    tabs.innerHTML = "";
    if (!state.currentFile) return;
    const btn = document.createElement("button");
    btn.className = "tab is-active";
    btn.textContent = state.currentFile;
    tabs.appendChild(btn);
  }

  function switchFile(name) {
    saveCurrentFile();
    state.currentFile = name;
    renderFileTree();
    renderTabs();
    loadCurrentFile();
  }

  function loadCurrentFile() {
    const editor = document.getElementById("codeEditor");
    const project = currentProject();
    if (!project || !state.currentFile) {
      editor.value = "";
      document.getElementById("statusFile").textContent = "Aucun fichier";
      updateLineNumbers();
      return;
    }
    editor.value = project.files[state.currentFile] ?? "";
    document.getElementById("statusFile").textContent = state.currentFile;
    document.getElementById("statusLang").textContent = languageFromFile(state.currentFile);
    updateLineNumbers();
  }

  function saveCurrentFile() {
    const project = currentProject();
    if (!project || !state.currentFile) return;
    project.files[state.currentFile] = document.getElementById("codeEditor").value;
    project.updatedAt = Date.now();
    saveProjects();
  }

  function languageFromFile(name) {
    const ext = name.split(".").pop().toLowerCase();
    return ({
      html:"HTML",css:"CSS",js:"JavaScript",jsx:"React JSX",ts:"TypeScript",
      tsx:"React TSX",py:"Python",json:"JSON",md:"Markdown"
    })[ext] || "Texte";
  }

  function updateLineNumbers() {
    const editor = document.getElementById("codeEditor");
    const count = Math.max(1, editor.value.split("\n").length);
    document.getElementById("lineNumbers").textContent =
      Array.from({length:count}, (_,i) => i + 1).join("\n");
  }

  function clearPreview() {
    document.getElementById("previewFrame").srcdoc =
      "<!doctype html><html><body style='font-family:system-ui;padding:24px;color:#667'>Clique sur Run pour lancer l’aperçu.</body></html>";
    document.getElementById("consoleOutput").textContent = "";
  }

  function runProject() {
    saveCurrentFile();
    const project = currentProject();
    if (!project) return;

    const frame = document.getElementById("previewFrame");
    const consoleEl = document.getElementById("consoleOutput");

    if (project.files["index.html"]) {
      let html = project.files["index.html"];
      const css = project.files["style.css"] || "";
      const js = project.files["script.js"] || "";
      html = html.replace(/<link[^>]*href=["']style\.css["'][^>]*>/i, "<style>" + css + "</style>");
      html = html.replace(/<script[^>]*src=["']script\.js["'][^>]*><\/script>/i, "<script>" + js.replace(/<\/script/gi, "<\\/script") + "<\/script>");
      frame.srcdoc = html;
      consoleEl.textContent = "Aperçu HTML lancé.";
      showPreviewTab("preview");
      return;
    }

    if (project.template === "javascript" && project.files["index.js"]) {
      consoleEl.textContent = "Exécution JavaScript locale :\n\n" + simulateConsole(project.files["index.js"]);
      showPreviewTab("console");
      return;
    }

    consoleEl.textContent =
      "Runner non disponible pour ce type de projet dans la version navigateur.\n" +
      "Le projet et ses fichiers sont bien éditables et enregistrés.";
    showPreviewTab("console");
  }

  function simulateConsole(code) {
    const outputs = [];
    const matches = code.matchAll(/console\.log\((["'`])([\s\S]*?)\1\)/g);
    for (const match of matches) outputs.push(match[2]);
    return outputs.length ? outputs.join("\n") : "Aucune sortie console détectée.";
  }

  function showPreviewTab(which) {
    document.querySelectorAll(".preview-tab").forEach(btn =>
      btn.classList.toggle("is-active", btn.dataset.preview === which)
    );
    document.getElementById("previewFrame").classList.toggle("hidden", which !== "preview");
    document.getElementById("consoleOutput").classList.toggle("hidden", which !== "console");
  }

  function addFile() {
    const project = currentProject();
    if (!project) return;
    const name = prompt("Nom du fichier :");
    if (!name) return;
    const clean = name.trim().replace(/^\/+/, "");
    if (!clean || project.files[clean] !== undefined) {
      alert("Ce fichier existe déjà ou le nom est invalide.");
      return;
    }
    saveCurrentFile();
    project.files[clean] = "";
    project.updatedAt = Date.now();
    saveProjects();
    state.currentFile = clean;
    renderFileTree();
    renderTabs();
    loadCurrentFile();
  }

  function openSettings(section) {
    const title = document.getElementById("settingsTitle");
    const content = document.getElementById("settingsContent");
    const sections = {
      general: {
        title:"Général",
        html:`
          <div class="setting-row"><div><strong>Sauvegarde locale</strong><p>Les projets sont sauvegardés automatiquement dans ce navigateur.</p></div><span>Activée</span></div>
          <div class="setting-row"><div><strong>Runner</strong><p>L'aperçu HTML/CSS/JS fonctionne déjà. Les runners système arriveront avec l'app desktop.</p></div><span>Web</span></div>
        `
      },
      appearance: {
        title:"Personnalisation",
        html:`
          <div class="setting-row"><div><strong>Thème</strong><p>CodeNost utilise actuellement son thème sombre natif.</p></div><span>Sombre</span></div>
          <div class="setting-row"><div><strong>Densité</strong><p>Interface compacte pensée pour l'éditeur.</p></div><span>Compacte</span></div>
        `
      },
      account: {
        title:"Compte",
        html:`
          <div class="setting-row"><div><strong>Session</strong><p>Aucun compte en ligne connecté.</p></div><span>Local</span></div>
          <div class="setting-row"><div><strong>Données</strong><p>Les projets restent uniquement dans ce navigateur pour cette version.</p></div><span>LocalStorage</span></div>
        `
      }
    };
    const item = sections[section] || sections.general;
    title.textContent = item.title;
    content.innerHTML = item.html;
    settingsModal.showModal();
  }

  document.getElementById("openLocalBtn").addEventListener("click", () => {
    showScreen("dashboard");
    renderProjects();
  });
  document.getElementById("continueLocalBtn").addEventListener("click", () => {
    showScreen("dashboard");
    renderProjects();
  });
  document.getElementById("showLoginBtn").addEventListener("click", () => showScreen("login"));
  document.querySelectorAll("[data-go]").forEach(btn =>
    btn.addEventListener("click", () => showScreen(btn.dataset.go))
  );

  document.querySelectorAll(".toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      input.type = input.type === "password" ? "text" : "password";
    });
  });

  document.getElementById("loginForm").addEventListener("submit", event => {
    event.preventDefault();
    document.getElementById("loginNote").textContent =
      "La connexion serveur n'est pas encore branchée. Utilise le mode local pour tester le logiciel.";
  });
  document.getElementById("githubLoginBtn").addEventListener("click", () => {
    document.getElementById("loginNote").textContent =
      "GitHub OAuth sera connecté avec le backend de CodeNost.";
  });

  function openNewProjectModal() {
    state.selectedTemplate = "empty";
    document.getElementById("projectNameInput").value = "";
    document.querySelectorAll(".template-card").forEach(card =>
      card.classList.toggle("is-selected", card.dataset.template === "empty")
    );
    projectModal.showModal();
    setTimeout(() => document.getElementById("projectNameInput").focus(), 0);
  }

  document.getElementById("newProjectBtn").addEventListener("click", openNewProjectModal);
  document.getElementById("emptyNewProjectBtn").addEventListener("click", openNewProjectModal);

  document.querySelectorAll(".template-card").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedTemplate = card.dataset.template;
      document.querySelectorAll(".template-card").forEach(c =>
        c.classList.toggle("is-selected", c === card)
      );
    });
  });

  document.getElementById("projectForm").addEventListener("submit", event => {
    event.preventDefault();
    const name = document.getElementById("projectNameInput").value.trim();
    if (!name) return;
    projectModal.close();
    createProject(name, state.selectedTemplate);
  });

  document.getElementById("backProjectsBtn").addEventListener("click", backToProjects);
  document.getElementById("saveProjectBtn").addEventListener("click", () => {
    saveCurrentFile();
    const btn = document.getElementById("saveProjectBtn");
    const old = btn.textContent;
    btn.textContent = "Enregistré";
    setTimeout(() => btn.textContent = old, 900);
  });
  document.getElementById("runProjectBtn").addEventListener("click", runProject);
  document.getElementById("newFileBtn").addEventListener("click", addFile);

  const editor = document.getElementById("codeEditor");
  editor.addEventListener("input", updateLineNumbers);
  editor.addEventListener("scroll", () => {
    document.getElementById("lineNumbers").scrollTop = editor.scrollTop;
  });
  editor.addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.slice(0,start) + "  " + editor.value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      updateLineNumbers();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentFile();
    }
  });

  document.querySelectorAll(".preview-tab").forEach(btn =>
    btn.addEventListener("click", () => showPreviewTab(btn.dataset.preview))
  );

  document.getElementById("chatForm").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.getElementById("chatInput");
    const value = input.value.trim();
    if (!value) return;
    const log = document.getElementById("chatLog");
    const empty = log.querySelector(".chat-empty");
    if (empty) empty.remove();

    const user = document.createElement("div");
    user.className = "chat-message user";
    user.textContent = value;
    log.appendChild(user);

    const system = document.createElement("div");
    system.className = "chat-message system";
    system.textContent = "L'IA n'est pas encore connectée à un modèle. L'interface de chat est prête.";
    log.appendChild(system);
    log.scrollTop = log.scrollHeight;
    input.value = "";
  });

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("is-active"));
      btn.classList.add("is-active");
      if (btn.dataset.nav === "projects") {
        if (!dashboardView.classList.contains("hidden")) return;
        backToProjects();
      } else {
        openSettings(btn.dataset.nav);
      }
    });
  });

  document.getElementById("profileBtn").addEventListener("click", () => openSettings("account"));
  document.getElementById("closeSettingsBtn").addEventListener("click", () => settingsModal.close());

  renderProjects();
})();
