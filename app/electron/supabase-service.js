const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://txblwoqdoeycyuzbzgac.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iY-NjlZXcVvzCekB6lD1FA_1IDkWh9V";

function createFileStorage(filePath) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch {}

  const persist = () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf8");
  };

  return {
    getItem(key) {
      return cache[key] ?? null;
    },
    setItem(key, value) {
      cache[key] = value;
      persist();
    },
    removeItem(key) {
      delete cache[key];
      persist();
    }
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function createSupabaseService({ userDataPath }) {
  const storage = createFileStorage(path.join(userDataPath, "supabase-auth.json"));

  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });

  async function status() {
    const { data, error } = await client.auth.getSession();
    if (error) return { authenticated: false, configured: true, user: null, error: error.message };
    return {
      authenticated: Boolean(data.session),
      configured: true,
      devBypass: false,
      user: data.session?.user || null
    };
  }

  async function login({ email, password }) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: data.user };
  }

  async function logout() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return true;
  }

  async function startGithubOAuth() {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: "codenost://auth/callback",
        skipBrowserRedirect: true
      }
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, url: data.url };
  }

  async function handleAuthCallback(url) {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    if (!code) return { ok: false, error: "Code OAuth manquant." };

    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: data.user };
  }

  async function getUser() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error("Connexion CodeNost requise.");
    return data.user;
  }

  async function readCloudSettings() {
    const user = await getUser();
    const { data, error } = await client
      .from("codenost_user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data?.settings || {};
  }

  async function writeCloudSettings(settings) {
    const user = await getUser();
    const { error } = await client
      .from("codenost_user_settings")
      .upsert({ user_id: user.id, settings }, { onConflict: "user_id" });
    if (error) throw error;
    return settings;
  }

  function readTextFiles(root) {
    const ignored = new Set([".git", "node_modules", ".DS_Store"]);
    const result = new Map();

    function walk(dir, relative = "") {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const rel = relative ? relative + "/" + entry.name : entry.name;
        const abs = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(abs, rel);
          continue;
        }

        const stat = fs.statSync(abs);
        if (stat.size > 2 * 1024 * 1024) continue;

        const buffer = fs.readFileSync(abs);
        if (buffer.includes(0)) continue;

        const content = buffer.toString("utf8");
        result.set(rel, { content, hash: sha256(content) });
      }
    }

    walk(root);
    return result;
  }

  async function askAi(payload) {
    await getUser();
    const { data, error } = await client.functions.invoke("codenost-ai", {
      body: payload
    });
    if (error) {
      let message = error.message || "Erreur IA CodeNost.";
      try {
        const body = await error.context?.json();
        if (body?.error) message = body.error;
      } catch {}
      throw new Error(message);
    }
    return data;
  }

  async function listAiThreads(projectId = null) {
    await getUser();
    let query = client
      .from("codenost_ai_threads")
      .select("id,title,project_id,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);

    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function listAiMessages(threadId) {
    await getUser();
    const { data, error } = await client
      .from("codenost_ai_messages")
      .select("id,role,content,actions,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function listCloudProjects() {
    await getUser();
    const { data, error } = await client
      .from("projects")
      .select("id,name,template,last_opened_at,updated_at,pcn")
      .is("deleted_at", null)
      .order("last_opened_at", { ascending: false });
    if (error) throw error;

    return (data || []).map(project => ({
      id: project.id,
      name: project.name,
      type: project.template || "project",
      openedAt: project.last_opened_at || project.updated_at,
      config: project.pcn || {}
    }));
  }

  async function downloadProject(projectId, basePath) {
    await getUser();

    const { data: project, error: projectError } = await client
      .from("projects")
      .select("id,name,template,pcn,cloud_enabled")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();
    if (projectError) throw projectError;

    const { data: files, error: filesError } = await client
      .from("codenost_project_files")
      .select("path,content,version,content_hash")
      .eq("project_id", projectId);
    if (filesError) throw filesError;

    const safeName = String(project.name || "Projet CodeNost")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .trim() || "Projet CodeNost";

    const root = path.join(basePath, safeName);
    fs.mkdirSync(root, { recursive: true });

    const pcn = project.pcn || {};
    pcn.name ||= project.name;
    pcn.type ||= project.template || "project";
    pcn.cloud ||= {};
    pcn.cloud.enabled = project.cloud_enabled !== false;
    pcn.cloud.projectId = project.id;
    pcn.cloud.lastSync = new Date().toISOString();
    pcn.cloud.files = {};

    for (const file of files || []) {
      if (file.path === ".pcn") continue;
      const target = path.join(root, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content || "", "utf8");
      pcn.cloud.files[file.path] = {
        version: file.version,
        hash: file.content_hash || sha256(file.content || "")
      };
    }

    fs.writeFileSync(path.join(root, ".pcn"), JSON.stringify(pcn, null, 2) + "\n", "utf8");

    await client
      .from("projects")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", projectId);

    return { path: root, name: pcn.name, config: pcn };
  }

  async function syncProject(projectPath, config) {
    const user = await getUser();
    const pcn = config || JSON.parse(fs.readFileSync(path.join(projectPath, ".pcn"), "utf8"));
    pcn.cloud ||= { enabled: true, projectId: null, lastSync: null, files: {} };

    if (pcn.cloud.enabled === false) {
      return { ok: false, skipped: true, error: "Le cloud est désactivé pour ce projet." };
    }

    let projectId = pcn.cloud.projectId;

    if (!projectId) {
      const slugBase = String(pcn.name || path.basename(projectPath))
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "").slice(0, 45) || "projet";

      const { data: project, error } = await client
        .from("projects")
        .insert({
          owner_id: user.id,
          name: pcn.name || path.basename(projectPath),
          slug: slugBase + "-" + crypto.randomUUID().slice(0, 8),
          template: pcn.type || "project",
          runtime: pcn.type || "local",
          files: {},
          settings: pcn.codenost || {},
          pcn,
          cloud_enabled: true,
          last_opened_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (error) throw error;
      projectId = project.id;
      pcn.cloud.projectId = projectId;
    }

    const { data: remoteFiles, error: remoteError } = await client
      .from("codenost_project_files")
      .select("id,path,content,version,content_hash")
      .eq("project_id", projectId);
    if (remoteError) throw remoteError;

    const remote = new Map((remoteFiles || []).map(file => [file.path, file]));
    const local = readTextFiles(projectPath);
    const known = pcn.cloud.files || {};
    const conflicts = [];
    const allPaths = new Set([...local.keys(), ...remote.keys(), ...Object.keys(known)]);

    const writeLocal = (filePath, content) => {
      const target = path.join(projectPath, ...filePath.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    };

    const deleteLocal = filePath => {
      const target = path.join(projectPath, ...filePath.split("/"));
      try { fs.rmSync(target, { force: true }); } catch {}
    };

    for (const filePath of allPaths) {
      const localFile = local.get(filePath);
      const remoteFile = remote.get(filePath);
      const previous = known[filePath];

      if (localFile && remoteFile) {
        if (!previous) {
          if (localFile.hash !== remoteFile.content_hash) {
            conflicts.push({
              path: filePath,
              local: localFile.content,
              remote: remoteFile.content,
              remoteVersion: remoteFile.version
            });
          } else {
            known[filePath] = { version: remoteFile.version, hash: remoteFile.content_hash };
          }
          continue;
        }

        const localChanged = previous.hash !== localFile.hash;
        const remoteChanged = previous.version !== remoteFile.version;

        if (localChanged && remoteChanged && localFile.hash !== remoteFile.content_hash) {
          conflicts.push({
            path: filePath,
            local: localFile.content,
            remote: remoteFile.content,
            remoteVersion: remoteFile.version
          });
          continue;
        }

        if (!localChanged && remoteChanged) {
          writeLocal(filePath, remoteFile.content);
          known[filePath] = { version: remoteFile.version, hash: remoteFile.content_hash };
          continue;
        }

        if (localChanged && !remoteChanged) {
          const { data, error } = await client
            .from("codenost_project_files")
            .update({ content: localFile.content })
            .eq("id", remoteFile.id)
            .select("version,content_hash")
            .single();
          if (error) throw error;
          known[filePath] = { version: data.version, hash: data.content_hash };
          continue;
        }

        known[filePath] = { version: remoteFile.version, hash: remoteFile.content_hash };
        continue;
      }

      if (localFile && !remoteFile) {
        if (previous) {
          const localChanged = previous.hash !== localFile.hash;
          if (localChanged) {
            conflicts.push({
              path: filePath,
              local: localFile.content,
              remote: null,
              remoteVersion: null
            });
          } else {
            deleteLocal(filePath);
            delete known[filePath];
          }
          continue;
        }

        const { data, error } = await client
          .from("codenost_project_files")
          .insert({ project_id: projectId, path: filePath, content: localFile.content })
          .select("version,content_hash")
          .single();
        if (error) throw error;
        known[filePath] = { version: data.version, hash: data.content_hash };
        continue;
      }

      if (!localFile && remoteFile) {
        if (previous) {
          const remoteChanged = previous.version !== remoteFile.version;
          if (remoteChanged) {
            conflicts.push({
              path: filePath,
              local: null,
              remote: remoteFile.content,
              remoteVersion: remoteFile.version
            });
          } else {
            const { error } = await client
              .from("codenost_project_files")
              .delete()
              .eq("id", remoteFile.id);
            if (error) throw error;
            delete known[filePath];
          }
          continue;
        }

        writeLocal(filePath, remoteFile.content);
        known[filePath] = { version: remoteFile.version, hash: remoteFile.content_hash };
      }
    }

    if (conflicts.length) {
      return { ok: false, conflicts, projectId };
    }

    pcn.cloud.files = known;
    pcn.cloud.lastSync = new Date().toISOString();

    fs.writeFileSync(path.join(projectPath, ".pcn"), JSON.stringify(pcn, null, 2) + "\n", "utf8");

    const { error: projectError } = await client
      .from("projects")
      .update({
        name: pcn.name || path.basename(projectPath),
        template: pcn.type || "project",
        pcn,
        settings: pcn.codenost || {},
        last_synced_at: pcn.cloud.lastSync,
        cloud_revision: Date.now()
      })
      .eq("id", projectId);
    if (projectError) throw projectError;

    return { ok: true, projectId, syncedAt: pcn.cloud.lastSync, files: local.size };
  }

  async function resolveConflict(projectPath, projectId, conflict, choice) {
    const target = path.join(projectPath, ...conflict.path.split("/"));

    if (choice === "remote") {
      if (conflict.remote === null) {
        try { fs.rmSync(target, { force: true }); } catch {}
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, conflict.remote, "utf8");
      }
      return { ok: true };
    }

    if (choice === "local") {
      if (conflict.local === null) {
        const { error } = await client
          .from("codenost_project_files")
          .delete()
          .eq("project_id", projectId)
          .eq("path", conflict.path);
        if (error) throw error;
      } else {
        const content = fs.readFileSync(target, "utf8");
        const { error } = await client
          .from("codenost_project_files")
          .upsert({ project_id: projectId, path: conflict.path, content }, { onConflict: "project_id,path" });
        if (error) throw error;
      }
      return { ok: true };
    }

    return { ok: false };
  }

  return {
    client,
    status,
    login,
    logout,
    startGithubOAuth,
    handleAuthCallback,
    readCloudSettings,
    writeCloudSettings,
    askAi,
    listAiThreads,
    listAiMessages,
    listCloudProjects,
    downloadProject,
    syncProject,
    resolveConflict
  };
}

module.exports = { createSupabaseService };