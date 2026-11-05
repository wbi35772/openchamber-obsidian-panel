import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import { createBrainPane } from './brainpane.js';

const host = connectHost();

const status = document.querySelector('#status');
const statusText = document.querySelector('#status-text');
const primary = document.querySelector('#primary');
const vaults = document.querySelector('#vaults');
const obsActions = document.querySelector('#obs-actions');
const addButton = document.querySelector('#add');
const openForm = document.querySelector('#openform');
const pathInput = document.querySelector('#path');
const openGo = document.querySelector('#open-go');
const openCancel = document.querySelector('#open-cancel');
const showButton = document.querySelector('#show');
const restartButton = document.querySelector('#restart');

const split = document.querySelector('#split');
const brainPane = document.querySelector('#brain-pane');
const obsidianPane = document.querySelector('#obsidian-pane');
const divider = document.querySelector('#divider');
const layoutColumn = document.querySelector('#layout-column');
const layoutRow = document.querySelector('#layout-row');
const layoutSwap = document.querySelector('#layout-swap');

const screen = document.querySelector('#screen');
const screenWrap = document.querySelector('#screen-wrap');
const screenOverlay = document.querySelector('#screen-overlay');
const screenMessage = document.querySelector('#screen-message');
const screenRetry = document.querySelector('#screen-retry');
const screenLaunch = document.querySelector('#screen-launch');
const keySink = document.querySelector('#key-sink');

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

const layout = {
  direction: 'column',
  ratio: 0.4,
  swapped: false,
};

const frame = { seq: 0, width: 0, height: 0 };
const lastResize = { width: 0, height: 0 };
let frameRun = 0;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const messageOf = (error) => (error instanceof Error ? error.message : String(error || 'Unknown error'));

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

/* Layout */

const renderLayout = () => {
  split.dataset.direction = layout.direction;
  brainPane.style.order = layout.swapped ? '3' : '1';
  divider.style.order = '2';
  obsidianPane.style.order = layout.swapped ? '1' : '3';
  brainPane.style.flexBasis = `${(layout.ratio * 100).toFixed(2)}%`;
  divider.setAttribute('aria-orientation', layout.direction === 'row' ? 'vertical' : 'horizontal');
  layoutColumn.setAttribute('aria-pressed', String(layout.direction === 'column'));
  layoutRow.setAttribute('aria-pressed', String(layout.direction === 'row'));
  layoutSwap.setAttribute('aria-pressed', String(layout.swapped));
};

const saveLayout = async () => {
  try {
    await host.storage.set('layout', { ...layout });
  } catch {}
};

const loadLayout = async () => {
  try {
    const saved = await host.storage.get('layout');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      if (saved.direction === 'row' || saved.direction === 'column') layout.direction = saved.direction;
      if (Number.isFinite(saved.ratio)) layout.ratio = Math.min(0.85, Math.max(0.15, saved.ratio));
      layout.swapped = saved.swapped === true;
    }
  } catch {}
  renderLayout();
  scheduleResize();
};

const setDirection = (direction) => {
  if (layout.direction === direction) return;
  layout.direction = direction;
  renderLayout();
  void saveLayout();
  scheduleResize();
};

layoutColumn.addEventListener('click', () => setDirection('column'));
layoutRow.addEventListener('click', () => setDirection('row'));
layoutSwap.addEventListener('click', () => {
  layout.swapped = !layout.swapped;
  renderLayout();
  void saveLayout();
});

let dragState = null;

divider.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  divider.setPointerCapture(event.pointerId);
  dragState = {
    origin: layout.direction === 'row' ? event.clientX : event.clientY,
    ratio: layout.ratio,
  };
  divider.focus({ preventScroll: true });
});

divider.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  const rect = split.getBoundingClientRect();
  const size = layout.direction === 'row' ? rect.width : rect.height;
  if (!size) return;
  const delta = (layout.direction === 'row' ? event.clientX : event.clientY) - dragState.origin;
  const next = dragState.ratio + (layout.swapped ? -delta : delta) / size;
  layout.ratio = Math.min(0.85, Math.max(0.15, next));
  renderLayout();
  scheduleResize();
});

const endDrag = (event) => {
  if (!dragState) return;
  dragState = null;
  try {
    divider.releasePointerCapture(event.pointerId);
  } catch {}
  void saveLayout();
};

divider.addEventListener('pointerup', endDrag);
divider.addEventListener('pointercancel', endDrag);

divider.addEventListener('dblclick', () => {
  layout.ratio = 0.38;
  renderLayout();
  void saveLayout();
  scheduleResize();
});

divider.addEventListener('keydown', (event) => {
  const step = 0.03;
  const back = layout.direction === 'row' ? 'ArrowLeft' : 'ArrowUp';
  const forward = layout.direction === 'row' ? 'ArrowRight' : 'ArrowDown';
  if (event.key !== back && event.key !== forward) return;
  event.preventDefault();
  const direction = (event.key === forward ? 1 : -1) * (layout.swapped ? -1 : 1);
  layout.ratio = Math.min(0.85, Math.max(0.15, layout.ratio + direction * step));
  renderLayout();
  void saveLayout();
  scheduleResize();
});

/* Obsidian window */

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
  obsActions.hidden = view.adding;
  renderVaults(current?.targets);
  if (view.adding) vaults.hidden = true;
  for (const tab of vaults.children) tab.disabled = view.busy || !canAct;
};

const refresh = async () => {
  if (view.busy) return;
  try {
    view.status = await api('GET', '/obsidian/status');
    view.error = null;
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
          view.error = messageOf(error);
        }
      } else if (match || Date.now() > view.pendingUntil) {
        view.pendingPath = '';
      }
    }
  } catch (error) {
    view.error = messageOf(error);
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
  if (view.status?.cdp) applyResize();
};

const run = async (action, body) => {
  if (view.busy) return;
  view.busy = true;
  view.error = null;
  render();
  try {
    view.status = await api('POST', `/obsidian/${action}`, body);
    view.targetSignature = '';
    if (view.status?.cdp) {
      lastResize.width = 0;
      lastResize.height = 0;
      applyResize();
      retryFrames();
    }
  } catch (error) {
    view.error = messageOf(error);
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
    } else {
      retryFrames();
    }
  } catch (error) {
    view.error = messageOf(error);
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
    view.error = messageOf(error);
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

/* Self-drawn Obsidian surface */

const setOverlay = (text) => {
  if (!text) {
    screenOverlay.hidden = true;
    return;
  }
  screenMessage.textContent = text;
  screenOverlay.hidden = false;
};

const retryFrames = () => {
  frameRun += 1;
  void frames();
};

const setScreenFrame = (url) => new Promise((resolve) => {
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    resolve();
  };
  const timer = window.setTimeout(done, 700);
  screen.addEventListener('load', done, { once: true });
  screen.addEventListener('error', done, { once: true });
  screen.src = url;
});

const frames = async () => {
  const run = ++frameRun;
  while (run === frameRun) {
    if (document.visibilityState !== 'visible') {
      await sleep(500);
      continue;
    }
    if (view.status && !view.status.cdp) {
      setOverlay('Obsidian is not connected. Open it to see it here.');
      await sleep(900);
      continue;
    }
    try {
      const result = await api('POST', '/obsidian/rest/surface-frame', { after: frame.seq, wait: 160 });
      if (run !== frameRun) return;
      if (result?.data) {
        await setScreenFrame(`data:${result.mime || 'image/jpeg'};base64,${result.data}`);
        if (run !== frameRun) return;
        frame.seq = Number.isInteger(result.seq) ? result.seq : frame.seq + 1;
        frame.width = Number(result.width) || frame.width;
        frame.height = Number(result.height) || frame.height;
        setOverlay('');
        scheduleResize();
      }
      await sleep(24);
    } catch (error) {
      if (run !== frameRun) return;
      setOverlay(`Obsidian screen unavailable · ${messageOf(error)}`);
      await sleep(1200);
    }
  }
};

let resizeTimer = 0;

function scheduleResize() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => applyResize(), 220);
}

const applyResize = async () => {
  if (!view.status?.cdp) return;
  const rect = screenWrap.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 60 || height < 60) return;
  if (Math.abs(width - lastResize.width) < 8 && Math.abs(height - lastResize.height) < 8) return;
  lastResize.width = width;
  lastResize.height = height;
  try {
    await api('POST', '/obsidian/rest/surface-resize', { width, height });
  } catch {}
};

if (typeof ResizeObserver === 'function') {
  new ResizeObserver(() => scheduleResize()).observe(screenWrap);
} else {
  window.addEventListener('resize', scheduleResize);
}

const displayRect = () => {
  const rect = screen.getBoundingClientRect();
  if (!frame.width || !frame.height || !rect.width || !rect.height) return rect;
  const scale = Math.min(rect.width / frame.width, rect.height / frame.height);
  const width = frame.width * scale;
  const height = frame.height * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
};

const point = (event, clamp) => {
  const rect = displayRect();
  if (!rect.width || !rect.height || !frame.width || !frame.height) return null;
  let x = Math.round((event.clientX - rect.left) * frame.width / rect.width);
  let y = Math.round((event.clientY - rect.top) * frame.height / rect.height);
  if (clamp) {
    x = Math.min(frame.width - 1, Math.max(0, x));
    y = Math.min(frame.height - 1, Math.max(0, y));
  } else if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    return null;
  }
  return { x, y };
};

const modifiers = (event) => ({
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
  shift: event.shiftKey,
});

const queue = [];
let flushTimer = 0;
let inFlight = Promise.resolve();

const flush = () => {
  window.clearTimeout(flushTimer);
  flushTimer = 0;
  if (!queue.length) return;
  const events = queue.splice(0, 200);
  inFlight = inFlight.then(() => api('POST', '/obsidian/rest/surface-input', { events })).catch((error) => {
    setOverlay(`Input failed · ${messageOf(error)}`);
  });
};

const scheduleFlush = () => {
  if (!flushTimer) flushTimer = window.setTimeout(flush, 16);
};

const push = (event) => {
  if (event.type === 'pointer' && event.action === 'move') {
    const last = queue[queue.length - 1];
    if (last && last.type === 'pointer' && last.action === 'move') {
      queue[queue.length - 1] = event;
      scheduleFlush();
      return;
    }
  }
  queue.push(event);
  if (queue.length >= 200) flush();
  else scheduleFlush();
};

let activePointer = -1;

const claimControl = () => {
  void api('POST', '/obsidian/rest/surface-control', { controller: 'user' }).catch(() => {});
};

const releaseControl = () => {
  void api('POST', '/obsidian/rest/surface-control', { controller: 'none' }).catch(() => {});
};

const placeSink = (event) => {
  try {
    const rect = screenWrap.getBoundingClientRect();
    keySink.style.left = `${Math.max(0, Math.min(rect.width - 2, event.clientX - rect.left))}px`;
    keySink.style.top = `${Math.max(0, Math.min(rect.height - 2, event.clientY - rect.top))}px`;
  } catch {}
};

const focusSink = (event) => {
  placeSink(event);
  try {
    keySink.focus({ preventScroll: true });
  } catch {}
};

screenWrap.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  const mapped = point(event, false);
  if (!mapped) return;
  event.preventDefault();
  try {
    screenWrap.setPointerCapture(event.pointerId);
  } catch {}
  activePointer = event.pointerId;
  focusSink(event);
  claimControl();
  push({
    type: 'pointer',
    action: 'down',
    x: mapped.x,
    y: mapped.y,
    button: event.button,
    buttons: event.buttons,
    modifiers: modifiers(event),
  });
});

screenWrap.addEventListener('pointermove', (event) => {
  const dragging = activePointer === event.pointerId;
  const mapped = point(event, dragging);
  if (!mapped) return;
  push({
    type: 'pointer',
    action: 'move',
    x: mapped.x,
    y: mapped.y,
    button: -1,
    buttons: event.buttons,
    modifiers: modifiers(event),
  });
});

const releasePointer = (event) => {
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  const mapped = point(event, true);
  if (activePointer === event.pointerId) {
    try {
      screenWrap.releasePointerCapture(event.pointerId);
    } catch {}
    activePointer = -1;
  }
  if (!mapped) return;
  event.preventDefault();
  push({
    type: 'pointer',
    action: 'up',
    x: mapped.x,
    y: mapped.y,
    button: event.button,
    buttons: event.buttons,
    modifiers: modifiers(event),
  });
};

screenWrap.addEventListener('pointerup', releasePointer);
screenWrap.addEventListener('pointercancel', releasePointer);
screenWrap.addEventListener('contextmenu', (event) => event.preventDefault());
screenWrap.addEventListener('focusout', () => releaseControl());

screenWrap.addEventListener('wheel', (event) => {
  const mapped = point(event, false);
  if (!mapped) return;
  event.preventDefault();
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  push({
    type: 'wheel',
    x: mapped.x,
    y: mapped.y,
    deltaX: event.deltaX * scale,
    deltaY: event.deltaY * scale,
    modifiers: modifiers(event),
  });
}, { passive: false });

let composing = false;

keySink.addEventListener('compositionstart', () => { composing = true; });
keySink.addEventListener('compositionend', (event) => {
  composing = false;
  const text = typeof event.data === 'string' && event.data ? event.data : keySink.value;
  keySink.value = '';
  if (text) push({ type: 'text', text });
});
keySink.addEventListener('input', () => {
  keySink.value = '';
});

const copyFromSurface = async () => {
  await sleep(60);
  try {
    const result = await api('POST', '/obsidian/rest/surface-clipboard', {});
    const text = typeof result?.text === 'string' ? result.text : '';
    if (text) await host.writeClipboard(text);
  } catch {}
};

keySink.addEventListener('keydown', (event) => {
  if (composing || event.isComposing || event.keyCode === 229) return;
  const key = event.key;
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const lower = key.toLowerCase();
    if (lower === 'c') {
      void copyFromSurface();
      return;
    }
    if (lower === 'v') return;
  }
  push({
    type: 'key',
    action: 'down',
    key,
    code: event.code,
    keyCode: event.keyCode,
    modifiers: modifiers(event),
  });
  event.preventDefault();
});

keySink.addEventListener('keyup', (event) => {
  if (composing || event.isComposing || event.keyCode === 229) return;
  push({
    type: 'key',
    action: 'up',
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    modifiers: modifiers(event),
  });
  event.preventDefault();
});

keySink.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text/plain') || '';
  if (text) push({ type: 'text', text });
  event.preventDefault();
});

screenRetry.addEventListener('click', () => retryFrames());
screenLaunch.addEventListener('click', () => void run('launch'));

createBrainPane(host, document.querySelector('#brain-pane'));
renderLayout();

let started = false;

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (started) return;
  started = true;
  void loadLayout();
  render();
  void refresh();
  window.setInterval(() => { void refresh(); }, 2_000);
  void frames();
});
