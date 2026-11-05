import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { connectCdp } from './cdp.js';
import { createSurface } from './surface.js';
import {
  closeWindow,
  forceKill,
  isMinimized,
  isRunning,
  launchProcess,
  minimizeWindow,
  resizeWindow,
  restoreWindow,
  showWindow,
} from './window.js';

const DEFAULT_EXE = 'E:\\Win\\text\\obsidian\\Obsidian.exe';
const DEFAULT_VIEWPORT = Object.freeze({ width: 1024, height: 800 });
const LAUNCH_ARGS = [
  '--remote-debugging-port=0',
  '--remote-debugging-address=127.0.0.1',
  '--remote-allow-origins=*',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-background-timer-throttling',
];

const defaultConfigDir = () => (
  process.env.OBSIDIAN_CONFIG_DIR
  || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'obsidian')
);

const stateFile = () => path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'OpenChamber', 'obsidian-panel', 'state.json',
);

const loadPanelSize = () => {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf8'));
    const width = parsed?.width;
    const height = parsed?.height;
    if (Number.isInteger(width) && Number.isInteger(height)
      && width > 0 && height > 0 && width <= 16_384 && height <= 16_384) {
      return { width, height };
    }
  } catch {}
  return null;
};

const savePanelSize = (size) => {
  try {
    const file = stateFile();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }));
  } catch {}
};

const expandVaultPath = (raw) => {
  if (typeof raw !== 'string') throw new Error('A vault path is required');
  let value = raw.trim().replace(/^"(.*)"$/, '$1');
  if (!value) throw new Error('A vault path is required');
  if (value === '~' || value.startsWith('~/') || value.startsWith('~\\')) {
    value = path.join(os.homedir(), value.slice(1));
  }
  return path.resolve(value);
};

const sameVaultPath = (left, right) => {
  const normalize = (value) => path.resolve(String(value || ''))
    .replace(/[\\/]+$/, '')
    .toLowerCase();
  if (!left || !right) return false;
  return normalize(left) === normalize(right);
};

const vaultRegistryFile = (configDir) => path.join(configDir, 'obsidian.json');

const readVaultRegistry = (configDir) => {
  try {
    const parsed = JSON.parse(readFileSync(vaultRegistryFile(configDir), 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.vaults && typeof parsed.vaults === 'object') {
      return parsed;
    }
  } catch {}
  return { vaults: {} };
};

const writeVaultRegistry = (configDir, registry) => {
  writeFileSync(vaultRegistryFile(configDir), JSON.stringify(registry), 'utf8');
};

const readActivePort = async (configDir) => {
  const text = await readFile(path.join(configDir, 'DevToolsActivePort'), 'utf8');
  const [portLine, pathLine] = text.split(/\r?\n/);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Obsidian wrote an invalid debug port');
  }
  if (typeof pathLine !== 'string' || !pathLine.startsWith('/')) {
    throw new Error('Obsidian wrote an invalid debug path');
  }
  return { port, wsPath: pathLine, wsUrl: `ws://127.0.0.1:${port}${pathLine}` };
};

const waitFor = async (check, timeoutMs, intervalMs = 200) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) throw lastError ?? new Error('Timed out waiting for Obsidian');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

const targetScore = (target) => {
  let score = 0;
  if (target.url.startsWith('app://obsidian.md')) score += 20;
  if (/obsidian/i.test(target.title)) score += 5;
  if (/devtools/i.test(target.url) || /devtools/i.test(target.title)) score -= 100;
  if (target.url === 'about:blank') score -= 10;
  return score;
};

const chooseTarget = (targets) => {
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const target of targets) {
    const score = targetScore(target);
    if (score > bestScore) {
      best = target;
      bestScore = score;
    }
  }
  return bestScore > Number.NEGATIVE_INFINITY ? best : null;
};

const VAULT_EXPRESSION = `(() => {
  try {
    const vault = window.app && window.app.vault;
    if (!vault) return '';
    const name = vault.getName();
    const path = vault.adapter && vault.adapter.basePath ? vault.adapter.basePath : '';
    return JSON.stringify({ name: String(name || ''), path: String(path || '') });
  } catch {
    return '';
  }
})()`;

// Titles look like "<note> - <vault> - Obsidian 1.15.0"; the vault is the
// segment before the trailing version, used until the page answers.
const vaultNameFromTitle = (title) => {
  const parts = String(title ?? '').split(' - ').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  if (/^Obsidian\b/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length > 0 ? parts[parts.length - 1] : '';
};

export const createObsidianRuntime = ({
  exePath = process.env.OBSIDIAN_EXE || DEFAULT_EXE,
  configDir = defaultConfigDir(),
  viewport = DEFAULT_VIEWPORT,
} = {}) => {
  let cdp = null;
  let sessionId = null;
  let targetId = null;
  let targetTitle = '';
  let targetUrl = '';
  let targets = [];
  const savedPanelSize = loadPanelSize();
  let panelSize = savedPanelSize ?? { ...viewport };
  if (savedPanelSize) viewport = { ...savedPanelSize };
  let hasPanelSize = savedPanelSize !== null;
  let lastResize = { width: 0, height: 0 };
  const sessionKey = crypto.randomUUID();
  let resizeCount = 0;
  let lastResizeRequest = null;
  let closed = false;
  let connectPromise = null;
  const vaultInfo = new Map();
  let vaultFetch = null;

  const contextMenu = {
    isOpen: false,
    close: async () => {},
    observe: async () => {},
    settle: async () => {},
  };

  const closeCdp = () => {
    const socket = cdp;
    cdp = null;
    sessionId = null;
    targetId = null;
    socket?.close();
  };

  const refreshTargets = async () => {
    if (!cdp?.isOpen) return targets;
    const result = await cdp.send('Target.getTargets');
    targets = (result.targetInfos ?? [])
      .filter((target) => target.type === 'page')
      .map((target) => ({
        id: target.targetId,
        title: target.title || '',
        url: target.url || '',
        attached: target.attached === true,
      }));
    return targets;
  };

  const readVaultInfo = async (id) => {
    if (!cdp?.isOpen) return null;
    let tempSession = null;
    try {
      tempSession = await cdp.attach(id);
      const result = await cdp.sendSession(tempSession, 'Runtime.evaluate', {
        expression: VAULT_EXPRESSION,
        returnByValue: true,
      });
      const text = result.result?.value;
      if (typeof text !== 'string' || !text) return null;
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed.name !== 'string' || !parsed.name) return null;
      return {
        name: parsed.name.slice(0, 120),
        path: typeof parsed.path === 'string' ? parsed.path.slice(0, 1024) : '',
      };
    } catch {
      return null;
    } finally {
      if (tempSession) await cdp.send('Target.detachFromTarget', { sessionId: tempSession }).catch(() => {});
    }
  };

  // Vault names need one evaluate per window, so they are cached and only
  // refreshed for windows that appeared since the last pass.
  const describeTargets = async () => {
    const list = await refreshTargets();
    const live = new Set(list.map((target) => target.id));
    for (const id of [...vaultInfo.keys()]) if (!live.has(id)) vaultInfo.delete(id);
    const stale = list.filter((target) => {
      const entry = vaultInfo.get(target.id);
      return !entry || (!entry.name && Date.now() - entry.at > 1_500);
    });
    if (stale.length > 0 && !vaultFetch) {
      vaultFetch = (async () => {
        for (const target of stale) {
          const info = await readVaultInfo(target.id);
          vaultInfo.set(target.id, info ? { ...info, at: Date.now() } : { name: '', path: '', at: Date.now() });
        }
      })().finally(() => { vaultFetch = null; });
      await vaultFetch;
    }
    return list.map((target) => {
      const info = vaultInfo.get(target.id);
      return {
        ...target,
        vault: info?.name || vaultNameFromTitle(target.title),
        vaultPath: info?.path || '',
      };
    });
  };

  // Each vault window is sized from inside its own page, so every tab keeps
  // the panel's shape instead of sharing one Win32 window handle.
  const applyViewport = async () => {
    if (!cdp?.isOpen || !sessionId || !hasPanelSize) return;
    const width = Math.round(panelSize.width);
    const height = Math.round(panelSize.height);
    if (!(width > 0 && height > 0)) return;
    await cdp.sendSession(sessionId, 'Runtime.evaluate', {
      expression: `(() => { try { window.resizeTo(${width}, ${height}); } catch {} })()`,
    }).catch(() => {});
  };

  // A minimized window produces no frames and ignores resizeTo, so selecting a
  // vault brings that specific window back before sizing it.
  const presentTarget = async () => {
    if (!targetTitle) return;
    const width = Math.round(panelSize.width);
    const height = Math.round(panelSize.height);
    await restoreWindow(targetTitle).catch(() => {});
    if (!hasPanelSize) return;
    if (width > 0 && height > 0) {
      await resizeWindow(targetTitle, width, height).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    await applyViewport();
  };

  // A minimized window stops producing frames, so the panel looks frozen and
  // eats clicks. Watch the presented page's visibility and bring it back.
  let mirrorBusy = false;
  const mirrorTimer = setInterval(async () => {
    if (closed || mirrorBusy || !cdp?.isOpen || !sessionId || !targetTitle) return;
    mirrorBusy = true;
    try {
      const state = await cdp.sendSession(sessionId, 'Runtime.evaluate', {
        expression: 'document.visibilityState',
        returnByValue: true,
      }).catch(() => null);
      if (state?.result?.value === 'hidden') await presentTarget();
    } finally {
      mirrorBusy = false;
    }
  }, 2_000);
  mirrorTimer.unref?.();

  const attach = async (id) => {
    if (!cdp?.isOpen) throw new Error('Obsidian debug connection is not established');
    if (sessionId && targetId === id) return;
    if (sessionId) {
      try {
        await cdp.send('Target.detachFromTarget', { sessionId });
      } catch {}
    }
    sessionId = await cdp.attach(id);
    targetId = id;
    const info = targets.find((target) => target.id === id);
    targetTitle = info?.title || '';
    targetUrl = info?.url || '';
    await cdp.sendSession(sessionId, 'Page.enable').catch(() => {});
  };

  const connect = async () => {
    if (closed) throw new Error('Obsidian runtime is closed');
    if (cdp?.isOpen && sessionId) return;
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
      const active = await readActivePort(configDir);
      const socket = await connectCdp(active.wsUrl);
      cdp = socket;
      socket.onClose(() => {
        if (cdp === socket) {
          cdp = null;
          sessionId = null;
          targetId = null;
          targetTitle = '';
          targetUrl = '';
          targets = [];
          vaultInfo.clear();
        }
      });
      socket.onEvent((event) => {
        if (event.method === 'Target.targetInfoChanged') {
          const info = event.params?.targetInfo;
          if (info?.targetId === targetId) {
            targetTitle = info.title || targetTitle;
            targetUrl = info.url || targetUrl;
          }
        } else if (event.method === 'Target.targetDestroyed') {
          if (event.params?.targetId === targetId) {
            sessionId = null;
            targetId = null;
          }
        }
      });
      await refreshTargets();
      const chosen = chooseTarget(targets);
      if (!chosen) throw new Error('Obsidian has no window to mirror');
      await attach(chosen.id);
    })().catch((error) => {
      cdp?.close();
      cdp = null;
      sessionId = null;
      targetId = null;
      throw error;
    }).finally(() => {
      connectPromise = null;
    });
    return connectPromise;
  };

  const ensurePage = async () => {
    await connect();
    if (!cdp?.isOpen || !sessionId) throw new Error('Obsidian page is not connected');
    return { cdp, sessionId };
  };

  const status = async () => {
    const running = await isRunning();
    let debugPort = null;
    try {
      debugPort = (await readActivePort(configDir)).port;
    } catch {}
    // Obsidian may have restarted on a new debug port; reconnect instead of
    // reporting a stale window list or asking for a restart.
    if (running && !cdp?.isOpen) {
      try {
        await connect();
      } catch {}
    }
    let list = targets;
    if (cdp?.isOpen) list = await describeTargets().catch(() => targets);
    else list = [];
    const current = targetId ? list.find((target) => target.id === targetId) : null;
    return {
      running,
      debugPort,
      cdp: Boolean(cdp?.isOpen),
      session: sessionKey,
      surface: { resizes: resizeCount, last: lastResizeRequest, input: surface?.debugInput?.() ?? null },
      target: targetId
        ? { id: targetId, title: targetTitle, url: targetUrl, vault: current?.vault || '' }
        : null,
      targets: list,
      viewport: { ...viewport },
    };
  };

  const launch = async () => {
    if (closed) throw new Error('Obsidian runtime is closed');
    if (await isRunning()) {
      try {
        await connect();
        return status();
      } catch {
        throw new Error('Obsidian is already running without a debug port. Restart it from the panel.');
      }
    }
    await rm(path.join(configDir, 'DevToolsActivePort'), { force: true });
    launchProcess(exePath, LAUNCH_ARGS);
    await waitFor(async () => {
      try {
        await connect();
        return true;
      } catch {
        return false;
      }
    }, 30_000, 250);
    return status();
  };

  const restart = async () => {
    closeCdp();
    await closeWindow();
    await waitFor(async () => !(await isRunning()), 10_000, 200).catch(() => {});
    if (await isRunning()) {
      await forceKill();
      await waitFor(async () => !(await isRunning()), 5_000, 200).catch(() => {});
    }
    return launch();
  };

  const listTargets = async () => {
    if (!cdp?.isOpen) return targets;
    await refreshTargets();
    return targets;
  };

  const selectTarget = async (id) => {
    await connect();
    await refreshTargets();
    if (!targets.some((target) => target.id === id)) {
      throw new Error('That Obsidian window is closed');
    }
    await attach(id);
    await presentTarget();
    surface.retarget();
    return status();
  };

  // Opens a folder as a vault. Obsidian is single-instance and ignores a vault
  // path on its command line, so the folder is registered in obsidian.json and
  // the app restarted: every vault flagged open comes back in its own window.
  const openVault = async (rawPath) => {
    if (closed) throw new Error('Obsidian runtime is closed');
    let resolved = expandVaultPath(rawPath);
    if (existsSync(resolved)) {
      const stat = statSync(resolved);
      if (stat.isFile()) resolved = path.dirname(resolved);
    } else {
      mkdirSync(resolved, { recursive: true });
    }

    let openPaths = [];
    if (await isRunning()) {
      await connect().catch(() => {});
      const list = await describeTargets().catch(() => targets);
      const already = list.find((target) => sameVaultPath(target.vaultPath, resolved));
      if (already) {
        return { ok: true, path: resolved, selected: already.id, status: await selectTarget(already.id) };
      }
      openPaths = list.map((target) => target.vaultPath).filter(Boolean);
    }

    // The app rewrites obsidian.json while it runs, so the file is written
    // only after the process is gone, right before the relaunch.
    closeCdp();
    if (await isRunning()) {
      await forceKill();
      await waitFor(async () => !(await isRunning()), 5_000, 150).catch(() => {});
    }

    // Every vault that was open must stay open through the relaunch; an entry
    // left closed is exactly how a window silently disappeared from the tabs.
    const registry = readVaultRegistry(configDir);
    const wanted = new Set(openPaths);
    wanted.add(resolved);
    let key = '';
    for (const vaultPath of wanted) {
      const existingKey = Object.keys(registry.vaults)
        .find((id) => sameVaultPath(registry.vaults[id]?.path, vaultPath));
      if (existingKey) {
        registry.vaults[existingKey] = { ...registry.vaults[existingKey], path: vaultPath, open: true };
        if (sameVaultPath(vaultPath, resolved)) key = existingKey;
      } else {
        const freshKey = crypto.randomBytes(8).toString('hex');
        registry.vaults[freshKey] = { path: vaultPath, ts: Date.now(), open: true };
        if (sameVaultPath(vaultPath, resolved)) key = freshKey;
      }
    }

    writeVaultRegistry(configDir, registry);
    await rm(path.join(configDir, 'DevToolsActivePort'), { force: true });
    launchProcess(exePath, LAUNCH_ARGS);
    return { ok: true, path: resolved, launched: true, key };
  };

  const setPanelSize = async (size) => {
    hasPanelSize = true;
    panelSize = { width: size.width, height: size.height };
    const width = Math.round(panelSize.width);
    const height = Math.round(panelSize.height);
    const changed = Math.abs(width - lastResize.width) > 8 || Math.abs(height - lastResize.height) > 8;
    if (width > 0 && height > 0 && changed) {
      lastResize = { width, height };
      viewport = { width, height };
      savePanelSize(panelSize);
      await applyViewport();
    }
    return { ...viewport };
  };

  // The OS folder dialog runs in a short-lived PowerShell with a topmost owner
  // form, so it appears above the OpenChamber/Obsidian windows. The chosen path
  // is returned base64-encoded so the console code page cannot corrupt it.
  const pick = { state: 'idle', path: '', error: '' };

  const pickFolder = () => {
    if (pick.state === 'active') return { ...pick };
    pick.state = 'active';
    pick.path = '';
    pick.error = '';
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$owner = New-Object System.Windows.Forms.Form',
      '$owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.FormBorderStyle = 0',
      '$owner.StartPosition = 1; $owner.Width = 2; $owner.Height = 2; $owner.Opacity = 0.01',
      '$owner.Show()',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$d.Description = 'Choose an Obsidian vault folder'",
      '$d.ShowNewFolderButton = $true',
      '$ok = $d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK',
      '$owner.Close()',
      'if ($ok) { [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($d.SelectedPath))) }',
    ].join('; ');
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true });
    let out = '';
    child.stdout.setEncoding('ascii');
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.resume();
    child.on('error', (error) => {
      pick.state = 'error';
      pick.error = error.message;
    });
    child.on('close', () => {
      if (pick.state === 'error') return;
      const encoded = out.trim();
      if (!encoded) {
        pick.state = 'cancelled';
        return;
      }
      pick.path = Buffer.from(encoded, 'base64').toString('utf8');
      pick.state = pick.path ? 'done' : 'cancelled';
    });
    return { ...pick };
  };

  const runtime = {
    get viewport() {
      return viewport;
    },
    get title() {
      return 'Obsidian';
    },
    controller: 'none',
    contextMenu,
    agentActive: false,
    ensurePage,
    setPanelSize,
    launch,
    restart,
    status,
    targets: listTargets,
    selectTarget,
    openVault,
    pick: () => ({ ...pick }),
    pickFolder,
    show: async () => {
      await presentTarget();
      return status();
    },
    minimize: async () => {
      await minimizeWindow(targetTitle);
      return status();
    },
    close: async () => {
      if (closed) return;
      closed = true;
      clearInterval(mirrorTimer);
      await surface.close();
      closeCdp();
    },
  };

  const surface = createSurface(runtime);
  runtime.surfaceFrame = (request) => surface.frame(request);
  runtime.surfaceInput = (events, theme) => surface.input(events, theme);
  runtime.surfaceControl = (controller) => surface.control(controller);
  runtime.surfaceResize = (size) => {
    resizeCount += 1;
    lastResizeRequest = { width: size.width, height: size.height, at: Date.now() };
    return surface.resize(size);
  };
  runtime.surfaceClipboard = () => surface.clipboard();

  return runtime;
};

export { readActivePort };
