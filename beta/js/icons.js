(() => {
  const icons = {
    "eye": '<path d="M2.06 12.35a1 1 0 0 1 0-.7C3.73 7.6 7.6 5 12 5c4.4 0 8.27 2.6 9.94 6.65a1 1 0 0 1 0 .7C20.27 16.4 16.4 19 12 19c-4.4 0-8.27-2.6-9.94-6.65"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="m2 2 20 20"/><path d="M6.71 6.71C4.96 7.82 3.55 9.5 2.68 11.6a1 1 0 0 0 0 .8C4.35 16.4 8.13 19 12 19c1.44 0 2.86-.36 4.15-1"/><path d="M10.73 5.08A9.9 9.9 0 0 1 12 5c4.4 0 8.27 2.6 9.94 6.65a1 1 0 0 1 0 .7 11.2 11.2 0 0 1-2.08 3.22"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/>',
    "log-in": '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    "github": '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28-.36 6.72-1.61 6.72-7.25A5.65 5.65 0 0 0 19.22 3.3 5.3 5.3 0 0 0 19.08.3S17.9-.08 15 1.8a13.38 13.38 0 0 0-7 0C5.1-.08 3.92.3 3.92.3a5.3 5.3 0 0 0-.14 3A5.65 5.65 0 0 0 2.28 7.3c0 5.6 3.44 6.85 6.72 7.25A4.8 4.8 0 0 0 8 18v4"/><path d="M8 19c-3 .9-3-1.5-4-2"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "refresh-cw": '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
    "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
    "paperclip": '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    "arrow-up": '<path d="m18 15-6-6-6 6"/>',
    "folder-input": '<path d="M2 9a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/><path d="M12 13v4"/><path d="m10 15 2 2 2-2"/>',
    "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
    "folder-plus": '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M3 5h5l2 2h11v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>',
    "folder": '<path d="M3 5h6l2 2h10v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>',
    "folder-open": '<path d="m6 14 1.5-3h13L19 19H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1"/>',
    "sparkles": '<path d="m12 3-1.9 4.6a2 2 0 0 1-1.1 1.1L4.4 10.6 9 12.5a2 2 0 0 1 1.1 1.1L12 18.2l1.9-4.6a2 2 0 0 1 1.1-1.1l4.6-1.9-4.6-1.9a2 2 0 0 1-1.1-1.1Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
    "layout-template": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    "files": '<path d="M15 2H6a2 2 0 0 0-2 2v13"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M18 22H9a2 2 0 0 1-2-2V7h9l4 4v9a2 2 0 0 1-2 2Z"/>',
    "git-branch": '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    "blocks": '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    "settings": '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
    "file-plus": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "file": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "panel-bottom-close": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18"/><path d="m9 10 3 3 3-3"/>',
    "panel-right-close": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
    "monitor": '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    "tablet": '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="12" x2="12.01" y1="18" y2="18"/>',
    "smartphone": '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    "rotate-cw": '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    "external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    "monitor-up": '<path d="m9 10 3-3 3 3"/><path d="M12 13V7"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    "palette": '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2a10 10 0 0 0 0 20c1 0 2-.5 2-1.5 0-.4-.2-.8-.4-1.1-.3-.4-.5-.9-.5-1.4a2 2 0 0 1 2-2h2.1A4.8 4.8 0 0 0 22 11.2 9.2 9.2 0 0 0 12.8 2Z"/>',
    "code-2": '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
    "cloud": '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    "trash-2": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
    "more-horizontal": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    "play": '<polygon points="5 3 19 12 5 21 5 3"/>',
    "save": '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'
  };

  function svg(name) {
    const body = icons[name] || icons.file;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function render(root = document) {
    root.querySelectorAll("[data-icon]").forEach(node => {
      node.innerHTML = svg(node.dataset.icon);
    });
  }

  window.CodeNostIcons = { svg, render };
})();
