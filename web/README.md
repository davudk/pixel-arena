# Pixel Arena — web

npm workspace for the web version (see `docs/PLAN.md`, "Platform decision").

| Package | What |
|---|---|
| `core/` (`@pixel-arena/core`) | Pure-data map model: document, ops, history, branches, merge, terrain, buildings, `.pxmap` files. No rendering or DOM. |

```bash
npm install
npm test        # Vitest, all packages
npm run check   # TypeScript, all packages
```
