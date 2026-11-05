import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing panel root');

const status = document.querySelector('#status');
const statusText = document.querySelector('#status-text');
const primary = document.querySelector('#primary');
const vaults = document.querySelector('#vaults');
const actions = document.querySelector('#actions');
const addButton = document.querySelector('#add');
const openForm = document.querySelector('#openform');
const pathInput = document.querySelector('#path');
const openGo = document.querySelector('#open-go');
const openCancel = document.querySelector('#open-cancel');
const showButton = document.querySelector('#show');
const restartButton = document.querySelector('#restart');

const view = {
  status: null,
  error: null,
  busy: false,
  adding: false,
  picking: false,
  pendingPath: '',
  pendingUntil: 0,
  targetSignature: '',
  session: '',
};

const api = async (method, path, body) => {
  const result = await host.serviceRequest({
    method,
    path,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (result.status < 200 || result.status >= 300) {
    let message = `Service returned ${result.status}`;
    try {
      const parsed = JSON.parse(result.body);
      if (typeof parsed?.error === 'string' && parsed.error) message = parsed.error;
    } catch {}
    throw new Error(message);
  }
  return result.body ? JSON.parse(result.body) : null;
};

const targetLabel = (target) => {
  const title = String(target?.title ?? '').trim();
  if (title) return title;
  try {
    return new URL(String(target?.url ?? '')).host || 'Obsidian window';
  } catch {
    return 'Obsidian window';
  }
};

const vaultLabel = (target) => {
  const name = String(target?.vault ?? '').trim();
  return name || targetLabel(target);
};

const pathKey = (value) => String(value || '')
  .trim()
  .replace(/[\\/]+/g, '\\')
  .replace(/\\+$/, '')
  .toLowerCase();

const renderVaults = (targets) => {
  const items = Array.isArray(targets) ? targets : [];
  const activeId = view.status?.target?.id || '';
  const signature = JSON.stringify(items.map((target) => [
    target.id,
    vaultLabel(target),
    target.vaultPath || '',
    target.id === activeId,
  ]));
  if (signature === view.targetSignature) return;
  view.targetSignature = signature;
  vaults.replaceChildren(...items.map((target) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'vault';
    tab.dataset.targetId = target.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(target.id === activeId));
    tab.title = target.vaultPath || targetLabel(target);
    tab.textContent = vaultLabel(target);
    return tab;
  }));
  vaults.hidden = items.length < 2;
  const selected = vaults.querySelector('[aria-selected="true"]');
  if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

const render = () => {
  const current = view.status;
  let state = 'idle';
  let message = 'Connecting to the Obsidian service…';
  let primaryLabel = 'Open';

  if (view.picking) {
    state = 'idle';
    message = 'Choose a vault folder in the dialog…';
  } else if (view.busy) {
    state = 'idle';
    message = 'Working…';
  } else if (view.error) {
    state = 'error';
    message = view.error;
  } else if (current?.cdp) {
    state = 'connected';
    message = `Connected · ${current.target?.vault || targetLabel(current.target)}`;
    primaryLabel = 'Focus';
  } else if (current?.running) {
    state = 'warning';
    message = 'Running without a debug port';
    primaryLabel = 'Restart';
  } else if (current) {
    state = 'idle';
    message = 'Not running';
    primaryLabel = 'Open';
  }

  status.dataset.state = state;
  status.title = message;
  statusText.textContent = message;
  primary.textContent = view.busy ? 'Working…' : primaryLabel;
  primary.disabled = view.busy || !current;
  const canAct = !view.busy && current?.running === true;
  showButton.disabled = !canAct;
  restartButton.disabled = !canAct;
  addButton.disabled = view.busy || view.picking;
  openForm.hidden = !view.adding;
  actions.hidden = view.adding;
  renderVaults(current?.targets);
  if (view.adding) vaults.hidden = true;
  for (const tab of vaults.children) tab.disabled = view.busy || !canAct;
};

const nudgeSurfaceSize = async () => {
  try {
    await host.setHeight(105);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await host.setHeight(104);
  } catch {}
};

const refresh = async () => {
  if (view.busy) return;
  try {
    view.status = await api('GET', '/obsidian/status');
    view.error = null;
    const session = view.status?.session;
    if (typeof session === 'string' && session && session !== view.session) {
      view.session = session;
      void nudgeSurfaceSize();
    }
    const pending = view.pendingPath;
    if (pending) {
      const targets = Array.isArray(view.status?.targets) ? view.status.targets : [];
      const match = targets.find((target) => target.vaultPath && pathKey(target.vaultPath) === pathKey(pending));
      if (match && match.id !== view.status?.target?.id) {
        try {
          view.status = await api('POST', '/obsidian/select', { targetId: match.id });
          view.targetSignature = '';
          view.pendingPath = '';
        } catch (error) {
          view.error = error instanceof Error ? error.message : 'Obsidian action failed';
        }
      } else if (match || Date.now() > view.pendingUntil) {
        view.pendingPath = '';
      }
    }
  } catch (error) {
    view.error = error instanceof Error ? error.message : 'Obsidian service unavailable';
  }
  if (view.picking) {
    try {
      const info = await api('GET', '/obsidian/pick');
      if (info?.state === 'done' && info.path) {
        await openPath(info.path);
        return;
      }
      if (info?.state === 'cancelled') {
        view.picking = false;
        view.adding = true;
        render();
        pathInput.focus();
        return;
      }
      if (info?.state === 'error') {
        view.picking = false;
        view.adding = true;
        view.error = info.error || 'Folder picker failed';
        render();
        return;
      }
    } catch {}
  }
  render();
};

const run = async (action, body) => {
  if (view.busy) return;
  view.busy = true;
  view.error = null;
  render();
  try {
    view.status = await api('POST', `/obsidian/${action}`, body);
    view.targetSignature = '';
  } catch (error) {
    view.error = error instanceof Error ? error.message : 'Obsidian action failed';
  } finally {
    view.busy = false;
    render();
  }
};

primary.addEventListener('click', () => {
  if (view.status?.cdp) void run('show');
  else if (view.status?.running) void run('restart');
  else void run('launch');
});

addButton.addEventListener('click', () => void startPick());

const closeForm = () => {
  view.adding = false;
  render();
};

const openPath = async (value) => {
  view.adding = false;
  view.picking = false;
  view.busy = true;
  view.error = null;
  render();
  try {
    const result = await api('POST', '/obsidian/open', { path: value });
    if (result?.status) view.status = result.status;
    view.targetSignature = '';
    if (!result?.selected) {
      view.pendingPath = result?.path || value;
      view.pendingUntil = Date.now() + 60_000;
    }
  } catch (error) {
    view.error = error instanceof Error ? error.message : 'Obsidian action failed';
    view.adding = true;
  } finally {
    view.busy = false;
    render();
  }
};

const submitOpen = async () => {
  const value = pathInput.value.trim();
  if (!value) {
    pathInput.focus();
    return;
  }
  pathInput.value = '';
  await openPath(value);
};

// Opens the native folder dialog on the desktop; the manual form stays as the
// fallback when the picker cannot start or the user cancels.
const startPick = async () => {
  if (view.busy || view.picking) return;
  view.adding = false;
  view.picking = true;
  view.error = null;
  render();
  try {
    const result = await api('POST', '/obsidian/pick');
    if (result?.state === 'done' && result.path) {
      await openPath(result.path);
    } else if (result?.state === 'error') {
      view.picking = false;
      view.adding = true;
      view.error = result.error || 'Folder picker failed';
      render();
      pathInput.focus();
    }
  } catch (error) {
    view.picking = false;
    view.adding = true;
    view.error = error instanceof Error ? error.message : 'Folder picker failed';
    render();
    pathInput.focus();
  }
};

openGo.addEventListener('click', () => void submitOpen());
openCancel.addEventListener('click', closeForm);
pathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void submitOpen();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeForm();
  }
});

showButton.addEventListener('click', () => void run('show'));
restartButton.addEventListener('click', () => void run('restart'));

vaults.addEventListener('click', (event) => {
  const tab = event.target.closest('.vault');
  if (!tab || tab.disabled) return;
  const targetId = tab.dataset.targetId;
  if (!targetId || targetId === view.status?.target?.id) return;
  void run('select', { targetId });
});

let started = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (started) return;
  started = true;
  void host.setHeight(104).catch(() => {});
  render();
  void refresh();
  window.setInterval(() => { void refresh(); }, 2_000);
});
