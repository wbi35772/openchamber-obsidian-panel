# OpenChamber Obsidian Panel

Mirror a real local Obsidian window inside an OpenChamber rail panel. Not a web
view, not a re-implementation: the panel streams the actual Obsidian surface over
WebSocket, forwards keyboard and pointer input, and switches between open vaults
with tabs.

The same service also exposes a small HTTP surface that a future AI Brain layer
uses to read and write the vault through the Obsidian Local REST API.

## Features

- Real local Obsidian window mirrored into the OpenChamber right rail.
- Pointer, keyboard, wheel, clipboard and resize forwarding.
- Vault tabs, with all open vaults preserved across restarts.
- Native folder picker for adding a vault (cancel to type a path).
- Watchdog that restores the mirror when Obsidian minimizes itself.
- Multi-window support: one Obsidian process, windows matched by title.
- English UI, no Chinese strings in the shipped bundle.

## Architecture

```
OpenChamber host
  |
  +-- panel/  (iframe, IIFE bundle)
  |     layout, status, vault tabs, open form
  |
  +-- service/  (host Node process, ESM bundle)
        |
        +-- src/cdp.js       Chrome DevTools Protocol client
        +-- src/surface.js   frame capture + input injection
        +-- src/window.js    Win32 window control
        +-- src/obsidian.js  lifecycle, multi-vault, watchdog
        +-- src/service.js   HTTP routes used by the panel
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

## Install into OpenChamber

Copy the extension directory to:

```
%USERPROFILE%\.config\openchamber\extensions\obsidian-panel
```

Required files: `package.json`, `icon.svg`, `panel/index.html`, `panel/main.js`,
`service/main.js`. No `npm install` is needed at runtime; both bundles are
self-contained.

Then restart the OpenChamber extension service, or toggle the panel off and on.

## Service routes

All routes are reached through the host proxy:

```
POST http://127.0.0.1:53253/api/guests/obsidian-panel/service/request
body: { method, path, body, viewerId }
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/obsidian/status` | Runtime state, CDP port, open vaults |
| POST | `/obsidian/open` | Open or create a vault by path |
| POST | `/obsidian/show` | Bring the Obsidian window to the front |
| POST | `/obsidian/restart` | Restart Obsidian with a debug port |
| POST | `/obsidian/select` | Focus a vault tab |
| GET | `/obsidian/screenshot` | Current mirrored frame |

## Roadmap

- [ ] Local REST API client with a single write queue.
- [ ] `If-Match` document-map versioning and 412 retry.
- [ ] Project auto-binding: OpenChamber project -> vault folder.
- [ ] Task radar: read task notes, edit status, append execution logs.
- [ ] Section-aware context injection into the composer.
- [ ] Rules wheel injection into a project workspace.
- [ ] Architecture graph: Canvas + typed edges, Breadcrumbs/Juggl views.

## Security

The service binds to the OpenChamber host only. It launches Obsidian with a
loopback debug port, and the REST token stays in the vault plugin config. Do not
expose the debug port or the OpenChamber host to a network you do not control.

## License

Apache-2.0
