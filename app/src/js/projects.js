(() => {
  const templates = [
    { id: "empty", name: "Projet vide", description: "Dossier minimal avec configuration .pcn", category: "all", icon: "folder" },
    { id: "static", name: "HTML / CSS / JavaScript", description: "Site web statique prêt pour la preview", category: "web", icon: "code-2" },
    { id: "react", name: "React", description: "Projet React avec Vite", category: "web", icon: "blocks" },
    { id: "vite", name: "Vite", description: "Projet web Vite minimal", category: "web", icon: "play" },
    { id: "javascript", name: "JavaScript", description: "Script JavaScript simple", category: "script", icon: "file" },
    { id: "typescript", name: "TypeScript", description: "Projet TypeScript strict", category: "script", icon: "file" },
    { id: "node", name: "Node.js", description: "Application Node.js", category: "runtime", icon: "terminal" },
    { id: "python", name: "Python", description: "Projet Python simple", category: "runtime", icon: "terminal" }
  ];

  const state = {
    recent: [],
    selectedTemplate: "empty",
    selectedCategory: "all",
    wizardStep: 1,
    location: "",
    onOpen: null
  };

  function icon(name) {
    return window.CodeNostIcons.svg(name);
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
    } catch {
      return "";
    }
  }

  async function refresh() {
    state.recent = await window.codenost.projects.list();
    renderProjects();
  }

  function renderProjects() {
    const list = document.getElementById("projectsList");
    const empty = document.getElementById("projectsEmpty");
    const query = document.getElementById("projectSearch")?.value.trim().toLowerCase() || "";
    const items = state.recent.filter(item => !query || item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query));

    list.innerHTML = "";
    empty.classList.toggle("is-hidden", items.length > 0 || query.length > 0);

    if (!items.length && query) {
      const row = document.createElement("div");
      row.className = "empty-state";
      row.innerHTML = `${icon("search")}<strong>Aucun résultat</strong><p>Aucun projet ne correspond à cette recherche.</p>`;
      list.appendChild(row);
      return;
    }

    for (const project of items) {
      const row = document.createElement("article");
      row.className = "project-row";
      row.innerHTML = `
        <div class="project-row-main" data-open-project="${escapeAttr(project.path)}">
          <strong>${escapeHtml(project.name)}</strong>
          <small>${escapeHtml(project.path)} · ${escapeHtml(project.type || "project")} · ${escapeHtml(formatDate(project.openedAt))}</small>
        </div>
        <div class="project-actions">
          <button class="mini-icon" data-open-project="${escapeAttr(project.path)}" title="Ouvrir">${icon("folder-open")}</button>
          <button class="mini-icon" data-remove-project="${escapeAttr(project.path)}" title="Retirer des récents">${icon("x")}</button>
        </div>
      `;
      list.appendChild(row);
    }

    list.querySelectorAll("[data-open-project]").forEach(node => {
      node.addEventListener("click", () => open(node.dataset.openProject));
    });
    list.querySelectorAll("[data-remove-project]").forEach(node => {
      node.addEventListener("click", async event => {
        event.stopPropagation();
        await window.codenost.projects.removeRecent(node.dataset.removeProject);
        await refresh();
      });
    });
  }

  function renderTemplates() {
    const list = document.getElementById("templateList");
    const search = document.getElementById("templateSearch")?.value.trim().toLowerCase() || "";
    const items = templates.filter(template => {
      const categoryMatch = state.selectedCategory === "all" || template.category === state.selectedCategory;
      const searchMatch = !search || template.name.toLowerCase().includes(search) || template.description.toLowerCase().includes(search);
      return categoryMatch && searchMatch;
    });

    list.innerHTML = "";
    for (const template of items) {
      const button = document.createElement("button");
      button.className = "template-item";
      button.type = "button";
      button.dataset.template = template.id;
      button.innerHTML = `
        <span class="template-icon">${icon(template.icon)}</span>
        <span>
          <strong>${escapeHtml(template.name)}</strong>
          <small>${escapeHtml(template.description)}</small>
        </span>
      `;
      button.addEventListener("click", () => openWizard(template.id));
      list.appendChild(button);
    }
  }

  function renderWizardTemplates() {
    const host = document.getElementById("wizardTemplates");
    host.innerHTML = "";
    for (const template of templates) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wizard-template" + (template.id === state.selectedTemplate ? " is-selected" : "");
      button.dataset.template = template.id;
      button.innerHTML = `<strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.description)}</small>`;
      button.addEventListener("click", () => {
        state.selectedTemplate = template.id;
        renderWizardTemplates();
        updateWizardSummary();
      });
      host.appendChild(button);
    }
  }

  function openWizard(template = "empty") {
    state.selectedTemplate = template;
    state.wizardStep = 1;
    state.location = "";
    document.getElementById("wizardName").value = "";
    document.getElementById("wizardLocation").value = "";
    document.getElementById("wizardCloud").checked = true;
    renderWizardTemplates();
    renderWizardStep();
    document.getElementById("projectWizard").showModal();
    setTimeout(() => document.getElementById("wizardName").focus(), 0);
  }

  function renderWizardStep() {
    document.querySelectorAll(".wizard-step").forEach(step => {
      step.classList.toggle("is-active", Number(step.dataset.step) === state.wizardStep);
    });
    document.querySelectorAll(".wizard-page").forEach(page => {
      page.classList.toggle("is-active", Number(page.dataset.page) === state.wizardStep);
    });

    document.getElementById("wizardBack").disabled = state.wizardStep === 1;
    document.getElementById("wizardNext").classList.toggle("is-hidden", state.wizardStep === 4);
    document.getElementById("wizardCreate").classList.toggle("is-hidden", state.wizardStep !== 4);
    updateWizardSummary();
  }

  function updateWizardSummary() {
    const name = document.getElementById("wizardName")?.value.trim() || "Projet sans nom";
    const template = templates.find(item => item.id === state.selectedTemplate);
    const location = state.location || "Emplacement à choisir";
    const cloud = document.getElementById("wizardCloud")?.checked ? "Cloud activé" : "Hors ligne";
    document.getElementById("wizardSummary").textContent = `${name} · ${template?.name || state.selectedTemplate} · ${location} · ${cloud}`;
  }

  function validateStep() {
    if (state.wizardStep === 1) {
      const name = document.getElementById("wizardName").value.trim();
      if (!name) {
        window.CodeNostUI.notify("Donne un nom au projet.", "error");
        return false;
      }
    }

    if (state.wizardStep === 3 && !state.location) {
      window.CodeNostUI.notify("Choisis l'emplacement du projet.", "error");
      return false;
    }
    return true;
  }

  async function chooseLocation() {
    const location = await window.codenost.projects.chooseLocation();
    if (!location) return;
    state.location = location;
    document.getElementById("wizardLocation").value = location;
    updateWizardSummary();
  }

  async function createFromWizard(event) {
    event.preventDefault();
    if (!validateStep()) return;

    const name = document.getElementById("wizardName").value.trim();
    const cloud = document.getElementById("wizardCloud").checked;

    try {
      const project = await window.codenost.projects.create({
        name,
        template: state.selectedTemplate,
        location: state.location,
        cloud
      });
      document.getElementById("projectWizard").close();
      await refresh();
      await state.onOpen?.(project);
    } catch (error) {
      window.CodeNostUI.notify(error.message || String(error), "error");
    }
  }

  async function importProject() {
    try {
      const project = await window.codenost.projects.importFolder();
      if (!project) return;
      await refresh();
      await state.onOpen?.(project);
    } catch (error) {
      window.CodeNostUI.notify(error.message || String(error), "error");
    }
  }

  async function open(projectPath) {
    try {
      const project = await window.codenost.projects.open(projectPath);
      await refresh();
      await state.onOpen?.(project);
    } catch (error) {
      window.CodeNostUI.notify(error.message || String(error), "error");
      await refresh();
    }
  }

  function bind() {
    document.getElementById("createProjectButton").addEventListener("click", () => openWizard("empty"));
    document.getElementById("emptyCreateProject").addEventListener("click", () => openWizard("empty"));
    document.getElementById("importProjectButton").addEventListener("click", importProject);
    document.getElementById("refreshProjects").addEventListener("click", refresh);
    document.getElementById("projectSearch").addEventListener("input", renderProjects);
    document.getElementById("templateSearch").addEventListener("input", renderTemplates);

    document.querySelectorAll(".category-chip").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedCategory = button.dataset.category;
        document.querySelectorAll(".category-chip").forEach(item => item.classList.toggle("is-active", item === button));
        renderTemplates();
      });
    });

    document.getElementById("wizardNext").addEventListener("click", () => {
      if (!validateStep()) return;
      state.wizardStep = Math.min(4, state.wizardStep + 1);
      renderWizardStep();
    });

    document.getElementById("wizardBack").addEventListener("click", () => {
      state.wizardStep = Math.max(1, state.wizardStep - 1);
      renderWizardStep();
    });

    document.getElementById("chooseLocationButton").addEventListener("click", chooseLocation);
    document.getElementById("projectWizardForm").addEventListener("submit", createFromWizard);
    document.getElementById("wizardName").addEventListener("input", updateWizardSummary);
    document.getElementById("wizardCloud").addEventListener("change", updateWizardSummary);

    renderTemplates();
  }

  function init({ onOpen }) {
    state.onOpen = onOpen;
    bind();
    return refresh();
  }

  function escapeHtml(value) {
    return window.CodeNostUI.escapeHtml(value);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  window.CodeNostProjects = {
    state,
    templates,
    init,
    refresh,
    openWizard,
    importProject
  };
})();
