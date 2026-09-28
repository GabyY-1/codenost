(() => {
  const state = {
    homeThreadId: null,
    editorThreadId: null,
    homeBusy: false,
    editorBusy: false
  };

  function surfaceConfig(surface) {
    if (surface === "editor") {
      return {
        messages: document.getElementById("editorAiMessages"),
        form: document.getElementById("editorAiForm"),
        input: document.getElementById("editorAiInput"),
        threads: document.getElementById("editorAiThreads"),
        newThread: document.getElementById("editorAiNewThread")
      };
    }

    return {
      messages: document.getElementById("homeAiMessages"),
      form: document.getElementById("homeAiForm"),
      input: document.getElementById("homeAiInput"),
      threads: document.getElementById("homeAiThreads"),
      newThread: document.getElementById("homeAiNewThread")
    };
  }

  function threadKey(surface) {
    return surface === "editor" ? "editorThreadId" : "homeThreadId";
  }

  function isBusy(surface) {
    return surface === "editor" ? state.editorBusy : state.homeBusy;
  }

  function setBusy(surface, value) {
    if (surface === "editor") state.editorBusy = value;
    else state.homeBusy = value;

    const ui = surfaceConfig(surface);
    if (!ui.form) return;
    const submit = ui.form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = value;
    if (ui.input) ui.input.disabled = value;
  }

  function clearMessages(surface) {
    const host = surfaceConfig(surface).messages;
    if (!host) return;
    host.innerHTML = "";
  }

  function showEmpty(surface) {
    const host = surfaceConfig(surface).messages;
    if (!host) return;

    host.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-ai";
    empty.innerHTML = window.CodeNostIcons.svg("sparkles");

    const title = document.createElement("p");
    title.textContent = surface === "editor"
      ? "Assistant de projet"
      : "Que veux-tu coder ?";

    const subtitle = document.createElement("small");
    subtitle.textContent = surface === "editor"
      ? "Je peux lire le projet et proposer des modifications."
      : "Pose une question ou ouvre un projet pour que je puisse agir dessus.";

    empty.append(title, subtitle);
    host.appendChild(empty);
  }

  function scrollMessages(surface) {
    const host = surfaceConfig(surface).messages;
    if (host) host.scrollTop = host.scrollHeight;
  }

  function messageBubble(surface, role, content) {
    const host = surfaceConfig(surface).messages;
    if (!host) return null;

    host.querySelector(".empty-ai")?.remove();

    const wrapper = document.createElement("article");
    wrapper.className = "ai-message ai-message-" + role;

    const label = document.createElement("div");
    label.className = "ai-message-label";
    label.textContent = role === "user" ? "Toi" : "CodeNost";

    const text = document.createElement("div");
    text.className = "ai-message-text";
    text.textContent = content || "";

    wrapper.append(label, text);
    host.appendChild(wrapper);
    scrollMessages(surface);
    return wrapper;
  }

  function loadingBubble(surface) {
    const wrapper = messageBubble(surface, "assistant", "");
    if (!wrapper) return null;
    wrapper.classList.add("is-loading");

    const text = wrapper.querySelector(".ai-message-text");
    text.textContent = "Analyse du projet…";
    return wrapper;
  }

  function actionName(action) {
    const names = {
      write_file: "Modifier le fichier",
      delete_file: "Supprimer le fichier",
      create_folder: "Créer le dossier",
      terminal: "Exécuter dans le terminal"
    };
    return names[action?.type] || "Action";
  }

  function actionTarget(action) {
    if (action?.type === "terminal") return action.command || "";
    return action?.path || "";
  }

  async function addPreview(card, action) {
    if (!window.CodeNostEditor.state.project) return;

    const preview = await window.CodeNostEditor.getAiActionPreview(action);
    if (!preview) return;

    const review = document.createElement("div");
    review.className = "ai-action-review";

    if (action.type === "write_file" || action.type === "delete_file") {
      const beforeBox = document.createElement("div");
      beforeBox.className = "ai-review-side";
      const beforeLabel = document.createElement("strong");
      beforeLabel.textContent = preview.exists ? "Avant" : "Nouveau fichier";
      const before = document.createElement("pre");
      before.textContent = preview.before || (preview.exists ? "" : "Ce fichier n'existe pas encore.");
      beforeBox.append(beforeLabel, before);

      const afterBox = document.createElement("div");
      afterBox.className = "ai-review-side";
      const afterLabel = document.createElement("strong");
      afterLabel.textContent = action.type === "delete_file" ? "Après suppression" : "Après";
      const after = document.createElement("pre");
      after.textContent = preview.after || (action.type === "delete_file" ? "Fichier supprimé" : "");
      afterBox.append(afterLabel, after);

      review.append(beforeBox, afterBox);
    } else {
      const single = document.createElement("pre");
      single.textContent = preview.after || actionTarget(action);
      review.appendChild(single);
    }

    card.appendChild(review);
  }

  async function applyAction(card, action) {
    const status = card.querySelector(".ai-action-status");
    const buttons = card.querySelector(".ai-action-buttons");

    if (buttons) {
      buttons.querySelectorAll("button").forEach(button => button.disabled = true);
    }

    if (status) status.textContent = "Application…";

    try {
      const result = await window.CodeNostEditor.applyAiAction(action);
      if (result?.ok === false) throw new Error("Action non appliquée.");
      card.classList.add("is-applied");
      if (status) status.textContent = "Appliqué";
      window.CodeNostUI.notify(actionName(action) + " : terminé.", "success");
    } catch (error) {
      card.classList.add("is-error");
      if (status) status.textContent = "Erreur";
      window.CodeNostUI.notify(error.message || String(error), "error");
      if (buttons) {
        buttons.querySelectorAll("button").forEach(button => button.disabled = false);
      }
    }
  }

  async function renderAction(surface, parent, action, mode, actionable = true) {
    const card = document.createElement("section");
    card.className = "ai-action-card";

    const heading = document.createElement("div");
    heading.className = "ai-action-heading";

    const left = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = actionName(action);
    const target = document.createElement("code");
    target.textContent = actionTarget(action);
    left.append(title, target);

    const status = document.createElement("span");
    status.className = "ai-action-status";
    status.textContent = actionable ? "En attente" : "Historique";

    heading.append(left, status);
    card.appendChild(heading);

    if (action.reason) {
      const reason = document.createElement("p");
      reason.className = "ai-action-reason";
      reason.textContent = action.reason;
      card.appendChild(reason);
    }

    if (mode === "review" && actionable) {
      try {
        await addPreview(card, action);
      } catch {}
    }

    if (!window.CodeNostEditor.state.project && actionable) {
      const note = document.createElement("p");
      note.className = "ai-action-note";
      note.textContent = "Ouvre un projet pour appliquer cette action.";
      card.appendChild(note);
      status.textContent = "Projet requis";
      parent.appendChild(card);
      return card;
    }

    if (actionable && mode !== "direct") {
      const buttons = document.createElement("div");
      buttons.className = "ai-action-buttons";

      const skip = document.createElement("button");
      skip.className = "secondary-button compact";
      skip.type = "button";
      skip.textContent = "Ignorer";

      const apply = document.createElement("button");
      apply.className = "primary-button compact";
      apply.type = "button";
      apply.textContent = "Appliquer";

      skip.addEventListener("click", () => {
        status.textContent = "Ignoré";
        card.classList.add("is-skipped");
        skip.disabled = true;
        apply.disabled = true;
      });

      apply.addEventListener("click", () => applyAction(card, action));
      buttons.append(skip, apply);
      card.appendChild(buttons);
    }

    parent.appendChild(card);

    if (actionable && mode === "direct" && window.CodeNostEditor.state.project) {
      await applyAction(card, action);
    }

    return card;
  }

  async function renderAssistant(surface, content, actions = [], options = {}) {
    const wrapper = messageBubble(surface, "assistant", content);
    if (!wrapper) return;

    const mode = options.mode || currentMode();
    const actionable = options.actionable !== false;

    if (Array.isArray(actions) && actions.length) {
      const actionsHost = document.createElement("div");
      actionsHost.className = "ai-actions-list";
      wrapper.appendChild(actionsHost);

      for (const action of actions) {
        await renderAction(surface, actionsHost, action, mode, actionable);
      }
    }

    scrollMessages(surface);
  }

  function currentMode() {
    return document.getElementById("aiModeSelect")?.value
      || window.CodeNostUI.state.settings?.aiMode
      || "review";
  }

  async function buildContext(surface) {
    if (surface === "editor" || window.CodeNostEditor.state.project) {
      return window.CodeNostEditor.buildAiContext();
    }

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

  async function ask(surface, prompt) {
    prompt = String(prompt || "").trim();
    if (!prompt || isBusy(surface)) return;

    const key = threadKey(surface);
    const mode = currentMode();

    messageBubble(surface, "user", prompt);
    const loading = loadingBubble(surface);
    setBusy(surface, true);

    try {
      const context = await buildContext(surface);
      const projectId = window.CodeNostEditor.getProjectId?.() || null;

      const response = await window.codenost.ai.ask({
        prompt,
        context,
        threadId: state[key],
        projectId,
        mode
      });

      loading?.remove();
      state[key] = response.threadId || state[key];

      await renderAssistant(
        surface,
        response.message || "Réponse reçue.",
        response.actions || [],
        { mode, actionable: true }
      );

      await refreshThreads(surface);
    } catch (error) {
      loading?.remove();
      const message = error.message || String(error);
      renderAssistant(surface, "Erreur : " + message, [], { actionable: false });

      if (message.includes("OPENROUTER_API_KEY") || message.includes("pas encore configurée")) {
        window.CodeNostUI.notify("Ajoute OPENROUTER_API_KEY dans les secrets Supabase pour activer l'IA.", "error");
      }
    } finally {
      setBusy(surface, false);
      const input = surfaceConfig(surface).input;
      if (input) input.focus();
    }
  }

  async function refreshThreads(surface) {
    const select = surfaceConfig(surface).threads;
    if (!select || !window.codenost.ai?.threads) return;

    const projectId = surface === "editor"
      ? window.CodeNostEditor.getProjectId?.() || null
      : null;

    try {
      const threads = await window.codenost.ai.threads(projectId);
      const selected = state[threadKey(surface)];

      select.innerHTML = "";
      const fresh = document.createElement("option");
      fresh.value = "";
      fresh.textContent = "Nouvelle conversation";
      select.appendChild(fresh);

      for (const thread of threads || []) {
        const option = document.createElement("option");
        option.value = thread.id;
        option.textContent = thread.title || "Conversation";
        select.appendChild(option);
      }

      select.value = selected || "";
    } catch {}
  }

  async function refreshHistory() {
    await Promise.all([
      refreshThreads("home"),
      refreshThreads("editor")
    ]);
  }

  async function loadThread(surface, threadId) {
    const key = threadKey(surface);
    state[key] = threadId || null;

    if (!threadId) {
      showEmpty(surface);
      return;
    }

    clearMessages(surface);

    try {
      const messages = await window.codenost.ai.messages(threadId);
      if (!messages?.length) {
        showEmpty(surface);
        return;
      }

      for (const message of messages) {
        if (message.role === "user") {
          messageBubble(surface, "user", message.content);
        } else if (message.role === "assistant") {
          await renderAssistant(
            surface,
            message.content,
            message.actions || [],
            { actionable: false, mode: "review" }
          );
        }
      }
    } catch (error) {
      renderAssistant(surface, "Impossible de charger l'historique : " + (error.message || error), [], { actionable: false });
    }
  }

  function newThread(surface) {
    const key = threadKey(surface);
    state[key] = null;
    const select = surfaceConfig(surface).threads;
    if (select) select.value = "";
    showEmpty(surface);
    surfaceConfig(surface).input?.focus();
  }

  function bindSurface(surface) {
    const ui = surfaceConfig(surface);
    if (!ui.form || !ui.input) return;

    ui.form.addEventListener("submit", event => {
      event.preventDefault();
      const value = ui.input.value;
      if (!value.trim()) return;
      ui.input.value = "";
      ui.input.style.height = "";
      ask(surface, value);
    });

    ui.input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        ui.form.requestSubmit();
      }
    });

    ui.input.addEventListener("input", () => {
      ui.input.style.height = "auto";
      ui.input.style.height = Math.min(120, ui.input.scrollHeight) + "px";
    });

    ui.threads?.addEventListener("change", () => {
      loadThread(surface, ui.threads.value);
    });

    ui.newThread?.addEventListener("click", () => newThread(surface));
  }

  function onProjectChanged() {
    state.editorThreadId = null;
    showEmpty("editor");
    refreshThreads("editor");
  }

  function init() {
    bindSurface("home");
    bindSurface("editor");

    document.getElementById("aiCreateProjectQuick")?.addEventListener("click", () => {
      window.CodeNostProjects.openWizard("empty");
    });

    document.getElementById("aiNewChatQuick")?.addEventListener("click", () => {
      newThread("home");
    });
  }

  window.CodeNostAI = {
    state,
    init,
    ask,
    newThread,
    refreshHistory,
    onProjectChanged
  };
})();