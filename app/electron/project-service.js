const fs = require("fs");
const path = require("path");
const os = require("os");

const IGNORE = new Set([".git", "node_modules", ".DS_Store"]);

function safeResolve(root, relative = "") {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relative);
  if (target !== absoluteRoot && !target.startsWith(absoluteRoot + path.sep)) {
    throw new Error("Chemin hors du projet interdit.");
  }
  return target;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sanitizeName(name) {
  return String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function templateFiles(template) {
  const common = {};
  const templates = {
    empty: common,
    static: {
      "index.html": `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Mon site</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>Mon projet CodeNost</h1>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
      "style.css": `body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
`,
      "script.js": `console.log("CodeNost");
`
    },
    javascript: {
      "index.js": `function main() {
  console.log("Bonjour CodeNost");
}

main();
`
    },
    typescript: {
      "index.ts": `function main(): void {
  console.log("Bonjour CodeNost");
}

main();
`,
      "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true
  }
}
`
    },
    node: {
      "package.json": `{
  "name": "codenost-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node index.js"
  }
}
`,
      "index.js": `console.log("Bonjour depuis Node.js");
`
    },
    python: {
      "main.py": `def main():
    print("Bonjour CodeNost")


if __name__ == "__main__":
    main()
`
    },
    react: {
      "package.json": `{
  "name": "codenost-react",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {}
}
`,
      "index.html": `<div id="root"></div><script type="module" src="/src/main.jsx"></script>\n`,
      "src/main.jsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(<App />);
`,
      "src/App.jsx": `export default function App() {
  return <h1>Mon projet React</h1>;
}
`,
      "src/style.css": `body { font-family: system-ui, sans-serif; margin: 40px; }\n`
    },
    vite: {
      "package.json": `{
  "name": "codenost-vite",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "devDependencies": {
    "vite": "latest"
  }
}
`,
      "index.html": `<div id="app"></div><script type="module" src="/src/main.js"></script>\n`,
      "src/main.js": `document.querySelector("#app").innerHTML = "<h1>Mon projet Vite</h1>";\n`
    }
  };
  return templates[template] || templates.empty;
}

function defaultPcn(name, template, cloud = true) {
  const commands = {
    static: { run: null, build: null, preview: "static" },
    javascript: { run: "node index.js", build: null, preview: null },
    typescript: { run: null, build: "npx tsc", preview: null },
    node: { run: "npm start", build: null, preview: null },
    python: { run: "python main.py", build: null, preview: null },
    react: { run: "npm run dev", build: "npm run build", preview: "dev-server" },
    vite: { run: "npm run dev", build: "npm run build", preview: "dev-server" },
    empty: { run: null, build: null, preview: null }
  }[template] || { run: null, build: null, preview: null };

  return {
    schema: 1,
    name,
    type: template,
    createdAt: new Date().toISOString(),
    commands,
    cloud: {
      enabled: Boolean(cloud),
      projectId: null,
      lastSync: null
    },
    codenost: {
      autoSave: true,
      previewAutoReload: true
    }
  };
}

function createProject({ name, template, location, cloud }) {
  const cleanName = sanitizeName(name);
  if (!cleanName) throw new Error("Nom de projet invalide.");

  const base = location || path.join(os.homedir(), "CodeNost");
  const root = path.join(base, cleanName);
  if (fs.existsSync(root) && fs.readdirSync(root).length) {
    throw new Error("Ce dossier existe déjà et n'est pas vide.");
  }

  fs.mkdirSync(root, { recursive: true });
  const files = templateFiles(template);
  for (const [relative, content] of Object.entries(files)) {
    const target = safeResolve(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }

  writeJson(path.join(root, ".pcn"), defaultPcn(cleanName, template, cloud));
  return openProject(root);
}

function ensurePcn(root) {
  const file = path.join(root, ".pcn");
  if (!fs.existsSync(file)) {
    const name = path.basename(root);
    writeJson(file, defaultPcn(name, "imported", true));
  }
  return readJson(file, {});
}

function openProject(root) {
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error("Dossier de projet introuvable.");
  }
  const config = ensurePcn(resolved);
  return { path: resolved, name: config.name || path.basename(resolved), config };
}

function readTree(root, relative = "", depth = 0) {
  if (depth > 10) return [];
  const directory = safeResolve(root, relative);
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => !IGNORE.has(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map(entry => {
      const rel = path.join(relative, entry.name).split(path.sep).join("/");
      return {
        name: entry.name,
        path: rel,
        type: entry.isDirectory() ? "folder" : "file",
        children: entry.isDirectory() ? readTree(root, rel, depth + 1) : undefined
      };
    });
}

function readFile(root, relativePath) {
  return fs.readFileSync(safeResolve(root, relativePath), "utf8");
}

function writeFile(root, relativePath, content) {
  const target = safeResolve(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, String(content), "utf8");
  return true;
}

function createFile(root, relativePath) {
  const target = safeResolve(root, relativePath);
  if (fs.existsSync(target)) throw new Error("Ce fichier existe déjà.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "", "utf8");
  return true;
}

function createFolder(root, relativePath) {
  const target = safeResolve(root, relativePath);
  if (fs.existsSync(target)) throw new Error("Ce dossier existe déjà.");
  fs.mkdirSync(target, { recursive: true });
  return true;
}

function deleteEntry(root, relativePath) {
  const target = safeResolve(root, relativePath);
  if (target === path.resolve(root)) throw new Error("Impossible de supprimer la racine du projet.");
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

function renameEntry(root, relativePath, nextRelativePath) {
  fs.renameSync(safeResolve(root, relativePath), safeResolve(root, nextRelativePath));
  return true;
}


function searchProject(root, query, options = {}) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];

  const maxResults = Math.max(1, Math.min(Number(options.maxResults) || 200, 1000));
  const results = [];

  function walk(relative = "", depth = 0) {
    if (depth > 12 || results.length >= maxResults) return;
    const dir = safeResolve(root, relative);
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.has(entry.name)) continue;

      const rel = path.join(relative, entry.name).split(path.sep).join("/");
      if (entry.isDirectory()) {
        walk(rel, depth + 1);
        if (results.length >= maxResults) return;
        continue;
      }

      if (entry.name.toLowerCase().includes(needle) || rel.toLowerCase().includes(needle)) {
        results.push({
          path: rel,
          line: null,
          column: null,
          preview: "Nom de fichier correspondant"
        });
        if (results.length >= maxResults) return;
      }

      let stat;
      try { stat = fs.statSync(safeResolve(root, rel)); } catch { continue; }
      if (!stat.isFile() || stat.size > 1024 * 1024) continue;

      let content;
      try {
        const buffer = fs.readFileSync(safeResolve(root, rel));
        if (buffer.includes(0)) continue;
        content = buffer.toString("utf8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        let from = 0;
        while (results.length < maxResults) {
          const index = lower.indexOf(needle, from);
          if (index === -1) break;
          results.push({
            path: rel,
            line: i + 1,
            column: index + 1,
            preview: lines[i].trim().slice(0, 240)
          });
          from = index + Math.max(1, needle.length);
        }
        if (results.length >= maxResults) return;
      }
    }
  }

  walk();
  return results;
}

module.exports = {
  readJson,
  writeJson,
  createProject,
  openProject,
  readTree,
  readFile,
  writeFile,
  createFile,
  createFolder,
  deleteEntry,
  renameEntry,
  searchProject,
  safeResolve
};
