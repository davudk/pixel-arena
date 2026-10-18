# Pixel Arena — web

npm workspace for the web version (see `docs/PLAN.md`, "Platform decision").

| Package | What |
|---|---|
| `core/` (`@pixel-arena/core`) | Pure-data map model: document, ops, history, branches, merge, terrain, buildings, `.pxmap` files. No rendering or DOM. |
| `app/` (`@pixel-arena/app`) | The editor UI (three.js + Svelte), runs in a browser or the desktop shell. |
| `desktop/` (`@pixel-arena/desktop`) | Electron shell: `app://` serving, native file dialogs, Steam (steamworks.js), packaging (`package.mjs`). |

```bash
npm install
npm test        # Vitest, all packages
npm run check   # TypeScript, all packages
npm run desktop # build the app and open it in Electron
npm run package # unsigned desktop builds in desktop/out/
```
