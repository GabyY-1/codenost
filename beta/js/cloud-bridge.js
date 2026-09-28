(() => {
  const sb = window.CodeNostSupabase;
  const base = window.codenost;
  const HIDDEN_KEY = "codenost.beta.hidden-cloud-projects.v1";

  const defaults = {
    theme: "dark",
    fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    autoSave: true,
    lineNumbers: true,
    breadcrumbs: true,
    minimap: false,
    aiMode: "review",
    previewAutoReload: true,
    panel: { explorer: true, ai: true, bottom: true }
  };

  async function user() {
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) throw new Error("Connexion CodeNost requise.");
    return data.user;
  }

  function pathToId(projectPath) {
    return String(projectPath || "").replace(/^cloud:\/\//, "");
  }

  function slugify(value) {
    return String(value || "projet")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").slice(0, 45) || "projet";
  }

  function templateFiles(type) {
    const files = {
      empty: {},
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
  <h1>Mon projet CodeNost</h1>
  <script src="script.js"><\/script>
</body>
</html>`,
        "style.css": "body {\n  margin: 40px;\n  font-family: system-ui, sans-serif;\n}\n",
        "script.js": "console.log(\"CodeNost\");\n"
      },
      javascript: { "index.js": "console.log(\"Bonjour CodeNost\");\n" },
      typescript: { "index.ts": "console.log(\"Bonjour CodeNost\");\n" },
      node: {
        "package.json": "{\n  \"private\": true,\n  \"scripts\": { \"start\": \"node index.js\" }\n}\n",
        "index.js": "console.log(\"Bonjour Node.js\");\n"
      },
      python: { "main.py": "print(\"Bonjour CodeNost\")\n" },
      react: {
        "index.html": "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"><\/script>\n",
        "src/main.jsx": "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\ncreateRoot(document.getElementById('root')).render(<App />);\n",
        "src/App.jsx": "export default function App(){ return <h1>Mon projet React</h1>; }\n"
      },
      vite: {
        "index.html": "<div id=\"app\"></div><script type=\"module\" src=\"/src/main.js\"><\/script>\n",
        "src/main.js": "document.querySelector('#app').innerHTML='<h1>Mon projet Vite</h1>';\n"
      }
    };
    return files[type] || {};
  }

  function pcnFor(name, type, cloud) {
    const commands = {
      static: { run: null, build: null, preview: "static" },
      javascript: { run: "node index.js", build: null, preview: null },
      typescript: { run: null, build: "npx tsc", preview: null },
      node: { run: "npm start", build: null, preview: null },
      python: { run: "python main.py", build: null, preview: null },
      react: { run: "npm run dev", build: "npm run build", preview: "dev-server" },
      vite: { run: "npm run dev", build: "npm run build", preview: "dev-server" },
      empty: { run: null, build: null, preview: null }
    }[type] || { run: null, build: null, preview: null };

    return {
      schema: 1,
      name,
      type,
      commands,
      cloud: { enabled: Boolean(cloud), projectId: null, lastSync: null },
      codenost: { autoSave: true, previewAutoReload: true },
      directories: []
    };
  }

  async function projectRow(projectPath) {
    const id = pathToId(projectPath);
    const { data, error } = await sb
      .from("projects")
      .select("id,name,template,runtime,pcn,settings,cloud_enabled,last_opened_at,updated_at")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) throw error;
    return data;
  }

  function makeTree(paths, directories = []) {
    const root = {};
    for (const dir of directories) {
      let node = root;
      for (const part of String(dir).split("/").filter(Boolean)) {
        node[part] ||= { __type: "folder" };
        node = node[part];
      }
    }
    for (const filePath of paths) {
      const parts = String(filePath).split("/").filter(Boolean);
      let node = root;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) node[part] = { __type: "file" };
        else {
          node[part] ||= { __type: "folder" };
          node = node[part];
        }
      });
    }

    function convert(node, prefix = "") {
      return Object.entries(node)
        .filter(([key]) => key !== "__type")
        .sort((a, b) => {
          const af = a[1].__type === "folder";
          const bf = b[1].__type === "folder";
          if (af !== bf) return af ? -1 : 1;
          return a[0].localeCompare(b[0]);
        })
        .map(([name, value]) => {
          const p = prefix ? prefix + "/" + name : name;
          return value.__type === "folder"
            ? { name, path: p, type: "folder", children: convert(value, p) }
            : { name, path: p, type: "file" };
        });
    }
    return convert(root);
  }

  base.auth = {
    status: async () => {
      const { data } = await sb.auth.getSession();
      return {
        authenticated: Boolean(data.session),
        devBypass: false,
        user: data.session?.user || null,
        configured: true
      };
    },
    login: async payload => {
      const { data, error } = await sb.auth.signInWithPassword({
        email: payload.email,
        password: payload.password
      });
      return error
        ? { ok: false, error: error.message }
        : { ok: true, user: data.user };
    },
    githubLogin: async () => {
      const clean = location.origin + location.pathname;
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: clean }
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, url: data.url };
    },
    logout: async () => {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      return true;
    },
    openSignup: async () => ({
      ok: false,
      error: "L'inscription n'est pas intégrée à la BETA du logiciel."
    }),
    onChanged: callback => {
      const { data } = sb.auth.onAuthStateChange((_event, session) => callback(session));
      return () => data.subscription.unsubscribe();
    }
  };

  base.projects = {
    list: async () => {
      await user();
      const hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
      const { data, error } = await sb
        .from("projects")
        .select("id,name,template,last_opened_at,updated_at")
        .is("deleted_at", null)
        .order("last_opened_at", { ascending: false });
      if (error) throw error;
      return (data || [])
        .filter(p => !hidden.has(p.id))
        .map(p => ({
          path: "cloud://" + p.id,
          name: p.name,
          type: p.template || "project",
          openedAt: p.last_opened_at || p.updated_at
        }));
    },

    chooseLocation: async () => "Cloud CodeNost",

    create: async payload => {
      const u = await user();
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("Nom de projet invalide.");
      const type = payload.template || "empty";
      const pcn = pcnFor(name, type, payload.cloud !== false);

      const { data: project, error } = await sb
        .from("projects")
        .insert({
          owner_id: u.id,
          name,
          slug: slugify(name) + "-" + crypto.randomUUID().slice(0, 8),
          template: type,
          runtime: type,
          files: {},
          settings: {},
          pcn,
          cloud_enabled: payload.cloud !== false,
          last_opened_at: new Date().toISOString()
        })
        .select("id,name,pcn")
        .single();
      if (error) throw error;

      pcn.cloud.projectId = project.id;
      const files = templateFiles(type);
      files[".pcn"] = JSON.stringify(pcn, null, 2) + "\n";

      const rows = Object.entries(files).map(([path, content]) => ({
        project_id: project.id,
        path,
        content
      }));

      if (rows.length) {
        const { error: fileError } = await sb.from("codenost_project_files").insert(rows);
        if (fileError) throw fileError;
      }

      await sb.from("projects").update({ pcn }).eq("id", project.id);
      return { path: "cloud://" + project.id, name, config: pcn };
    },

    importFolder: base.projects.importFolder,
    cloneGithub: base.projects.cloneGithub,

    open: async projectPath => {
      const row = await projectRow(projectPath);
      const id = row.id;
      await sb.from("projects").update({ last_opened_at: new Date().toISOString() }).eq("id", id);
      const hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
      hidden.delete(id);
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
      return { path: "cloud://" + id, name: row.name, config: row.pcn || pcnFor(row.name, row.template, row.cloud_enabled) };
    },

    removeRecent: async projectPath => {
      const hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
      hidden.add(pathToId(projectPath));
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
      return true;
    },

    readTree: async projectPath => {
      const row = await projectRow(projectPath);
      const { data, error } = await sb
        .from("codenost_project_files")
        .select("path")
        .eq("project_id", row.id)
        .order("path");
      if (error) throw error;
      return makeTree((data || []).map(x => x.path), row.pcn?.directories || []);
    },

    readFile: async (projectPath, relativePath) => {
      const id = pathToId(projectPath);
      const { data, error } = await sb
        .from("codenost_project_files")
        .select("content")
        .eq("project_id", id)
        .eq("path", relativePath)
        .single();
      if (error) throw error;
      return data.content;
    },

    writeFile: async (projectPath, relativePath, content) => {
      const id = pathToId(projectPath);
      const { error } = await sb
        .from("codenost_project_files")
        .upsert({ project_id: id, path: relativePath, content: String(content) }, { onConflict: "project_id,path" });
      if (error) throw error;

      if (relativePath === ".pcn") {
        try {
          const pcn = JSON.parse(content);
          await sb.from("projects").update({ pcn, name: pcn.name || undefined }).eq("id", id);
        } catch {}
      }
      return true;
    },

    createFile: async (projectPath, relativePath) => {
      const id = pathToId(projectPath);
      const { error } = await sb.from("codenost_project_files").insert({
        project_id: id,
        path: relativePath,
        content: ""
      });
      if (error) throw error;
      return true;
    },

    createFolder: async (projectPath, relativePath) => {
      const row = await projectRow(projectPath);
      const pcn = row.pcn || {};
      const dirs = new Set(pcn.directories || []);
      dirs.add(relativePath);
      pcn.directories = [...dirs];
      const { error } = await sb.from("projects").update({ pcn }).eq("id", row.id);
      if (error) throw error;
      return true;
    },

    deleteEntry: async (projectPath, relativePath) => {
      const id = pathToId(projectPath);
      const { data, error } = await sb
        .from("codenost_project_files")
        .select("id,path")
        .eq("project_id", id);
      if (error) throw error;
      const ids = (data || []).filter(f => f.path === relativePath || f.path.startsWith(relativePath + "/")).map(f => f.id);
      if (ids.length) {
        const { error: delError } = await sb.from("codenost_project_files").delete().in("id", ids);
        if (delError) throw delError;
      }
      return true;
    },

    renameEntry: async (projectPath, relativePath, nextRelativePath) => {
      const id = pathToId(projectPath);
      const { data, error } = await sb
        .from("codenost_project_files")
        .select("id,path")
        .eq("project_id", id);
      if (error) throw error;

      for (const file of data || []) {
        if (file.path === relativePath || file.path.startsWith(relativePath + "/")) {
          const next = nextRelativePath + file.path.slice(relativePath.length);
          const { error: updateError } = await sb
            .from("codenost_project_files")
            .update({ path: next })
            .eq("id", file.id);
          if (updateError) throw updateError;
        }
      }
      return true;
    },

    readConfig: async projectPath => {
      const row = await projectRow(projectPath);
      return row.pcn || {};
    },

    writeConfig: async (projectPath, config) => {
      const id = pathToId(projectPath);
      const { error } = await sb.from("projects").update({ pcn: config }).eq("id", id);
      if (error) throw error;
      await base.projects.writeFile(projectPath, ".pcn", JSON.stringify(config, null, 2) + "\n");
      return true;
    }
  };

  base.settings = {
    read: async () => {
      const { data: sessionData } = await sb.auth.getSession();
      const u = sessionData.session?.user;
      if (!u) return defaults;
      const { data, error } = await sb
        .from("codenost_user_settings")
        .select("settings")
        .eq("user_id", u.id)
        .maybeSingle();
      if (error) return defaults;
      return { ...defaults, ...(data?.settings || {}) };
    },
    write: async settings => {
      const u = await user();
      const { error } = await sb
        .from("codenost_user_settings")
        .upsert({ user_id: u.id, settings }, { onConflict: "user_id" });
      if (error) throw error;
      return settings;
    }
  };
})();