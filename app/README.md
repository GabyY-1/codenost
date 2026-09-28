# CodeNost Desktop

Le logiciel CodeNost est séparé du site vitrine situé à la racine du repository.

## Lancer en développement

```bash
cd app
npm install
npm run dev
```

Pour tester l'interface avant que le backend d'authentification soit disponible :

### Windows PowerShell

```powershell
$env:CODENOST_DEV_BYPASS="1"
npm run dev
```

### Linux / macOS

```bash
CODENOST_DEV_BYPASS=1 npm run dev
```

Ce bypass est réservé au développement. En fonctionnement normal, un compte CodeNost est obligatoire.

## Structure

```text
app/
├── electron/
│   ├── main.js
│   ├── preload.js
│   └── project-service.js
├── src/
│   ├── index.html
│   ├── styles/
│   └── js/
└── package.json
```

## Fonctionnel

- application desktop Electron
- connexion obligatoire avec architecture backend
- mode de développement explicite
- projets réels sur le disque
- fichier projet `.pcn`
- création de projets par assistant
- import de dossiers existants
- templates HTML/CSS/JS, JavaScript, TypeScript, Node.js, Python, React et Vite
- liste des projets récents
- explorateur de fichiers
- création de fichiers et dossiers
- Monaco Editor
- onglets
- breadcrumbs
- numéros de lignes
- minimap configurable
- sauvegarde et sauvegarde automatique
- terminal intégré avec plusieurs terminaux
- panneau Terminal / Problèmes / Sortie
- preview statique locale
- modes desktop / tablette / téléphone
- preview dans une fenêtre CodeNost séparée
- thème sombre et thème clair
- paramètres persistants
- palette de commandes simple
- panneaux masquables

## Préparé mais volontairement non simulé

Ces fonctions nécessitent encore leurs services réels :

- authentification CodeNost en production
- OAuth GitHub
- Cloud CodeNost
- IA CodeNost
- synchronisation et résolution de conflits cloud
- Git avancé
- catalogue d'extensions officielles

Les interfaces correspondantes indiquent clairement leur état au lieu de présenter de fausses fonctionnalités.

## Build desktop

```bash
npm run dist
```

Electron Builder est configuré pour Windows, Linux et macOS.
