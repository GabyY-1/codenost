# CodeNost Desktop

CodeNost est une application desktop Electron. La version web BETA a été abandonnée.

## Lancer en développement

```bash
cd app
npm install
npm run dev
```

## Structure

```text
app/
├── electron/
│   ├── main.js
│   ├── preload.js
│   ├── project-service.js
│   └── supabase-service.js
├── src/
│   ├── index.html
│   ├── styles/
│   └── js/
└── package.json
```

## Fonctionnel

- application desktop Electron
- authentification Supabase obligatoire
- email + mot de passe
- session persistante
- OAuth GitHub
- projets réels sur le disque
- fichier projet `.pcn`
- création de projets par assistant
- import de dossiers existants
- templates HTML/CSS/JS, JavaScript, TypeScript, Node.js, Python, React et Vite
- Monaco Editor
- explorateur de fichiers
- onglets
- breadcrumbs
- sauvegarde automatique
- terminal intégré
- panneau Terminal / Problèmes / Sortie
- preview statique locale
- paramètres persistants
- CodeNost Cloud avec Supabase
- synchronisation Local / Cloud
- résolution de conflits
- projets Cloud téléchargeables sur Desktop
- IA CodeNost via Supabase Edge Function + OpenRouter
- historique IA
- actions IA sur les fichiers et le terminal
- modes IA Direct / Confirmation / Review

## Supabase

Projet Supabase :

```text
txblwoqdoeycyuzbzgac
```

Redirect URL GitHub OAuth pour l'application desktop :

```text
codenost://auth/callback
```

## IA CodeNost

Le modèle principal est configuré via le secret Supabase :

```text
OPENROUTER_MODEL
```

Le fournisseur utilise :

```text
OPENROUTER_API_KEY
```

La clé API ne doit jamais être placée dans le repository.

## Build desktop

```bash
npm run dist
```

Electron Builder est configuré pour Windows, Linux et macOS.
