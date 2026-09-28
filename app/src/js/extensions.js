(() => {
  const catalog = [
    {
      id: "codenost.word-wrap",
      name: "CodeNost Word Wrap",
      description: "Retour à la ligne automatique dans l'éditeur.",
      version: "1.0.0"
    },
    {
      id: "codenost.trim-whitespace",
      name: "CodeNost Clean Save",
      description: "Supprime les espaces inutiles en fin de ligne à la sauvegarde.",
      version: "1.0.0"
    }
  ];

  const state = {
    enabled: new Set(),
    settings: null
  };

  function isEnabled(id) {
    return state.enabled.has(id);
  }

  function transformOnSave(filePath, value) {
    let next = String(value);

    if (isEnabled("codenost.trim-whitespace") && !/\.(png|jpe?g|gif|webp|ico)$/i.test(filePath || "")) {
      const trailingNewline = next.endsWith("\n");
      next = next
        .split(/\r?\n/)
        .map(line => line.replace(/[ \t]+$/g, ""))
        .join("\n");
      if (trailingNewline && !next.endsWith("\n")) next += "\n";
    }

    return next;
  }

  function applyEditor(editor) {
    if (!editor) return;
    editor.updateOptions({
      wordWrap: isEnabled("codenost.word-wrap") ? "on" : "off"
    });
  }

  async function persist() {
    state.settings.extensions = [...state.enabled];
    state.settings = await window.codenost.settings.write(state.settings);
    window.CodeNostUI.state.settings = state.settings;
    applyEditor(window.CodeNostEditor?.state?.editor);
    render();
  }

  async function toggle(id) {
    if (state.enabled.has(id)) state.enabled.delete(id);
    else state.enabled.add(id);
    await persist();
  }

  function render() {
    const host = document.getElementById("officialExtensionsList");
    const summary = document.getElementById("extensionsSummary");
    if (!host) return;

    host.innerHTML = "";
    if (summary) summary.textContent = catalog.length + " extension(s) officielle(s) disponible(s).";

    for (const extension of catalog) {
      const card = document.createElement("div");
      card.className = "extension-card";

      const head = document.createElement("div");
      head.className = "extension-card-head";

      const title = document.createElement("strong");
      title.textContent = extension.name;

      const version = document.createElement("span");
      version.textContent = "v" + extension.version;

      head.append(title, version);

      const description = document.createElement("p");
      description.textContent = extension.description;

      const button = document.createElement("button");
      button.type = "button";
      button.className = isEnabled(extension.id)
        ? "secondary-button compact"
        : "primary-button compact";
      button.textContent = isEnabled(extension.id) ? "Désactiver" : "Activer";
      button.addEventListener("click", () => toggle(extension.id));

      card.append(head, description, button);
      host.appendChild(card);
    }
  }

  function init(settings) {
    state.settings = settings || {};
    state.enabled = new Set(Array.isArray(state.settings.extensions) ? state.settings.extensions : []);
    render();
  }

  window.CodeNostExtensions = {
    state,
    catalog,
    init,
    isEnabled,
    transformOnSave,
    applyEditor,
    render
  };
})();