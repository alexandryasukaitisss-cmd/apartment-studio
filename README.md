# Apartment Studio

[![ci](https://github.com/alexandryasukaitisss-cmd/apartment-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/alexandryasukaitisss-cmd/apartment-studio/actions/workflows/ci.yml)

**Live demo:** <https://alexandryasukaitisss-cmd.github.io/apartment-studio/>

![Apartment Studio 2D plan, 3D volume, walkthrough, and cost estimate tour](docs/demo-tour.gif)

Apartment Studio helps you plan a renovation in the browser. Start with a demo apartment or import your own JSON project, then walk through a 2D plan and a 3D view, try wall and floor finishes, place furniture, mark doors, windows, sockets, and get a material and work estimate.

Everything stays on your device. There is no account, cloud sync, or telemetry.

The demo runs entirely in the browser. Product URL import needs the local server; offline HTML/text import and project JSON import work without it.

Version 0.2.0. Free for personal and non-commercial use ([PolyForm Noncommercial 1.0.0](LICENSE)).

Русская версия: [README.ru.md](README.ru.md).

## Demo and your own project

The first screen offers two paths:

- **Открыть демо** loads a demonstration apartment with a complete room layout, furniture, finishes, and estimate data.
- **Импортировать свой проект** loads a JSON export from this app or another compatible project.

The demo is a sample, not a measurement. Replace its geometry in **Размеры** or import your own project before buying materials.

## Run

Requirements: Node.js 20 or newer.

```sh
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4317>. The local server binds only to loopback.

For development, run the API and Vite in two terminals:

```sh
npm run server
npm run dev
```

`npm run dev` serves the UI on a Vite port and proxies `/api` to `127.0.0.1:4317`.

## What is included

- 2D plan with rooms, walls, doors, windows, furniture, electrical points, engineering items, a ruler, door swings, and live camera FOV cone.
- Synchronized **2D + 3D Split View**, 3D cutaway scene, and first-person walk-through camera (with preset room viewpoints, saved views, auto-tour, and eye-level toggle).
- **4 renovation stages** in 3D: bare concrete shell, rough-in/engineering, finishes without furniture, and fully furnished apartment.
- **2D Wall Elevation view** (with exact cm heights for sockets, switches, openings, furniture, and human scale figure) + **Before/After split-curtain variant comparison**.
- Realistic 3D details: procedural bump maps + RoomEnvironment IBL lighting, 3D interior doors (framed or flush hidden), skirting boards, curtains, 3D wall electrical outlets, 1-click whole-apartment style presets, and local `.glb`/`.gltf` 3D model import.
- **Smart Layout Audit**: net room dimensions after plaster/screed/ceiling allowances, large-furniture delivery route & 90° turn check from entrance, plumbing slope & riser distance checks, inward bathroom door alerts, TV glare & window blocking checks, entrance dirty-zone & privacy cone, storage index + household storage checklist.
- 7-stage **Renovation Roadmap** linked to measured areas, electrical counts, and budgets, plus material/consumables/work estimates and comparison across up to 20 variants.
- Export: project JSON, estimate CSV, wall elevation SVG, and a printable work brief for builders/electricians (HTML/PDF).
- Offline product import from saved HTML or pasted characteristics, plus an optional local URL reader for supported stores.
- **A2UI 1.0 Generative UI Assistant + Multi-CLI support**: interactive native A2UI v1.0 cards with safe, undoable `callAgentFunction` actions powered by your local CLI agents (**Codex**, **Claude Code**, **OpenCode**, **Gemini CLI**, **Ollama**) or a built-in offline A2UI advisor, plus a standalone terminal CLI (`npm run agent`).
- Undo/redo, autosave to IndexedDB, and explicit project export/import.

## AI Agent via CLI (A2UI 1.0)

You can invoke the renovation assistant directly from the terminal or connect your local AI CLIs in the **AI** tab when running locally (`npm start`):

```sh
npm run agent -- --list-providers
npm run agent -- --provider codex --prompt "Audit the floor plan and suggest a warm minimalist style" --project kvartira-project.json
npm run agent -- --provider claude --model sonnet --prompt "Fix bathroom door swing and suggest living room furniture" --json
npm run agent -- --provider opencode --prompt "Check TV glare and storage"
npm run agent -- --provider gemini --prompt "Compare renovation stages"
npm run agent -- --provider offline --prompt "Audit" --json
```

All CLI invocations run strictly without shell interpolation (`shell: false`), validate A2UI v1.0 component and action allowlists, and every UI action is undoable with `⌘Z`.

## Privacy

- The project is stored in IndexedDB in your browser.
- Exported JSON may contain uploaded photos and personal measurements. Treat it as private data.
- The optional product URL reader contacts only the URL you enter and the page's image URL. It is a local loopback service, not a proxy for arbitrary browsing.
- No analytics, accounts, or remote storage.

## Limits

- The demo geometry is approximate and is not a measured survey or construction drawing. Verify every dimension before purchase or construction.
- The 3D view is a visual approximation, not a photorealistic render.
- Collision checks use static furniture envelopes. They do not model door swing, human movement, appliance operation, or structural loads.
- Store import compatibility is best-effort. Some stores block requests, require JavaScript, or do not publish dimensions; manual input remains available.
- This is a planning tool, not engineering, electrical, or structural advice.

## Tests

```sh
npm test          # 225 app tests
npm run test:server # 67 server tests
npm run build
```

The public tree does not include the native macOS wrapper or the Node runtime used by the private build. It runs as a local web app.

## License

**PolyForm Noncommercial License 1.0.0** — free for personal, educational, and non-commercial use. Commercial use is prohibited without a separate written license from the copyright holder. See [LICENSE](LICENSE).
