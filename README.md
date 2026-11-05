# OpenChamber Obsidian Panel

A single right-rail panel that merges two things: the **Brain** task hub (Chinese
UI) and a mirror of the real local Obsidian window (English UI). It is not a web
view and not a re-implementation: Obsidian is driven over the DevTools protocol,
the panel streams real frames and forwards pointer, wheel, keyboard, IME and
clipboard input.

The same service exposes an HTTP bridge that the Brain pane (and any future agent
layer) uses to read and write the vault through the Obsidian Local REST API.

## Features

- One self-drawn panel with two panes: Brain tasks and the Obsidian surface.
- Explicit layout choice: **Stacked** (Brain above Obsidian) or **Side by side**,
  with a draggable divider and keyboard resizing. The choice and ratio persist in
  host storage under `panel-layout`.
- Real Obsidian window mirrored into the rail: pointer, keyboard, wheel, clipboard
  and resize forwarding, with `surface-frame` long-polling.
- Vault tabs for every open Obsidian window, switchable without restarting.
- Brain pane: project selector (OpenChamber projects + vault-only projects), task
  list by status/priority, status editing, execution-log append, "dispatch to
  agent" (starts an OpenChamber session with the task brief), and note opening.
- The same Brain implementation powers the full-page view and the left status
  section; the merged panel imports `createBrainPane` directly.
- Native folder picker for adding a vault (cancel to type a path).
- Watchdog that restores the mirror when Obsidian minimizes itself.
- Multi-window support: one Obsidian process, windows matched by title.
- English panel UI, Chinese Brain UI.

## Architecture

```
OpenChamber host
  |
  +-- panel/            self-drawn rail panel (IIFE bundle)
  |     src/panel.js        layout, status, vault tabs, open form, surface input
  |     src/brainpane.js    Brain pane factory (shared with the full page/section)
  |
  +-- brain/            full-page Brain app and the compact status section
  |
  +-- service/          host Node process (ESM bundle)
        +-- src/cdp.js        Chrome DevTools Protocol client
        +-- src/surface.js    frame capture + input injection
        +-- src/window.js     Win32 window control
        +-- src/obsidian.js   lifecycle, multi-vault, watchdog
        +-- src/service.js    HTTP routes: mirror bridge + vault REST bridge
```

The panel never talks to Obsidian directly. Every action goes through the
service, which owns the CDP connection and the window handles.

## Build

```bash
npm install
npm run build
```

Outputs:

- `service/main.js` (Node, ESM)
- `panel/main.js` (browser, IIFE)
- `brain/main.js` (browser, IIFE)
- `brain/section.js` (browser, IIFE, compact status section)

## Install into OpenChamber

Copy the extension directory to:

```
%USERPROFILE%\.config\openchamber\extensions\obsidian-panel
```

Required files: `package.json`, `icon.svg`, `panel/index.html`, `panel/main.js`,
`brain/index.html`, `brain/main.js`, `brain/section.html`, `brain/section.js`,
`service/main.js`. No `npm install` is needed at runtime; the bundles are
self-contained.

Reload the OpenChamber renderer with `Ctrl+R` after changing the manifest, the
panel HTML or the bundles. The host restarts guest services on reload.

## Service routes

All routes are reached through the host proxy:

```
POST http://127.0.0.1:53253/api/guests/obsidian-panel/service/request
body: { method, path, body, viewerId }
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/obsidian/status` | Runtime state, CDP port, active target, open vaults |
| GET | `/obsidian/targets` | Refresh and list CDP targets (vault windows) |
| POST | `/obsidian/select` | Focus a vault tab |
| POST | `/obsidian/open` | Open or create a vault by path |
| POST | `/obsidian/launch` | Launch Obsidian with the debug port |
| POST | `/obsidian/restart` | Restart Obsidian |
| POST | `/obsidian/show` | Bring the Obsidian window to the front |
| GET/POST | `/obsidian/pick` | Native folder picker session |

Mirror bridge (used by the panel frame loop):

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/obsidian/rest/surface-frame` | Long-poll a frame `{after,wait}` -> `{seq,width,height,mime,data}` |
| POST | `/obsidian/rest/surface-input` | Forward input events (pointer/wheel/key/text, batch <= 256) |
| POST | `/obsidian/rest/surface-control` | Take/release controller ownership |
| POST | `/obsidian/rest/surface-resize` | Resize the mirrored viewport |
| POST | `/obsidian/rest/surface-clipboard` | Read the page selection |

Vault REST bridge (used by Brain; all under `/obsidian/rest/`):

`service-info`, `projects`, `note`, `frontmatter`, `append`, `open`, `search`,
`list`, `outline`, `section`, `write`, `project/init`, `task/create`, `tasks`,
`config`. Writes use `If-Match` document-map versioning with a single writer and
412 retry.

## Layout storage

The panel persists `{ direction, ratio, swapped }` under `host.storage` key
`panel-layout`. The older key `layout` is intentionally ignored so a stale
side-by-side choice does not override the stacked default.

## Roadmap

- [x] Local REST API client with a single write queue.
- [x] `If-Match` document-map versioning and 412 retry.
- [x] Project auto-binding: OpenChamber project -> vault folder.
- [x] Task radar: read task notes, edit status, append execution logs.
- [x] Section-aware context injection into the composer.
- [ ] Rules wheel injection into a project workspace.
- [ ] Architecture graph: Canvas + typed edges, Breadcrumbs/Juggl views.

## Security

The service binds to the OpenChamber host only. It launches Obsidian with a
loopback debug port, and the REST token stays in the vault plugin config. Do not
expose the debug port or the OpenChamber host to a network you do not control.

## License

Apache-2.0
