import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

const host = connectHost();

const nodes = {
  vault: document.querySelector('#vault'),
  projectSelect: document.querySelector('#project-select'),
  projectPath: document.querySelector('#project-path'),
  newProject: document.querySelector('#project-new'),
  bind: document.querySelector('#bind'),
  openVault: document.querySelector('#open-vault'),
  refresh: document.querySelector('#refresh'),
  error: document.querySelector('#error'),
  count: document.querySelector('#count'),
  filters: document.querySelector('#filters'),
  tasks: document.querySelector('#tasks'),
  detail: document.querySelector('#detail'),
  newTask: document.querySelector('#new-task'),
  activity: document.querySelector('#activity'),
  dialog: document.querySelector('#create-dialog'),
  form: document.querySelector('#create-form'),
  fTitle: document.querySelector('#f-title'),
  fPriority: document.querySelector('#f-priority'),
  fAgent: document.querySelector('#f-agent'),
  fSpec: document.querySelector('#f-spec'),
  fCriteria: document.querySelector('#f-criteria'),
  fCancel: document.querySelector('#f-cancel'),
  projectDialog: document.querySelector('#project-dialog'),
  projectForm: document.querySelector('#project-form'),
  pName: document.querySelector('#p-name'),
  pPath: document.querySelector('#p-path'),
  pCancel: document.querySelector('#p-cancel'),
};

const state = {
  ready: false,
  booted: false,
  busy: false,
  vaultPath: 'D:\\brain',
  baseFolder: '20-笔记/项目',
  directory: null,
  vaultProjects: [],
  projectSignature: '',
  projectName: '',
  projectDirectory: '',
  bound: false,
  ocProjects: [],
  ocProjectId: '',
  ocProjectName: '',
  ocProjectDirectory: '',
  tasks: [],
  filter: 'all',
  selectedPath: '',
  selectedNote: null,
  error: null,
  activity: 'Ready.',
};

const STATUSES = ['todo', 'running', 'blocked', 'done'];
const STATUS_LABEL = { todo: 'Todo', running: 'Running', blocked: 'Blocked', done: 'Done' };
const STATUS_TONE = { todo: 'tone-muted', running: 'tone-info', blocked: 'tone-warning', done: 'tone-success' };
const PRIORITY_TONE = { P0: 'tone-error', P1: 'tone-warning', P2: 'tone-info', P3: 'tone-muted' };
const STATUS_RANK = { running: 0, todo: 1, blocked: 2, done: 3 };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const messageOf = (error) => (error instanceof Error ? error.message : String(error || 'Unknown error'));

const basename = (value) => {
  const parts = String(value || '').trim().replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || '';
};

const stamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const say = (text) => {
  state.activity = text;
  renderActivity();
};

const toast = async (kind, message) => {
  try {
    await host.toast({ kind, message });
  } catch {}
};

const api = async (path, body) => {
  const result = await host.serviceRequest({
    method: 'POST',
    path,
    body: JSON.stringify(body ?? {}),
  });
  let parsed = null;
  try {
    parsed = result.body ? JSON.parse(result.body) : null;
  } catch {}
  if (result.status < 200 || result.status >= 300) {
    const error = new Error(parsed?.error || `Service returned ${result.status}`);
    error.status = result.status;
    throw error;
  }
  if (parsed && parsed.ok === false) throw new Error(parsed.error || 'Request failed');
  return parsed;
};

const rest = (route, body) => api(`/obsidian/rest/${route}`, { vaultPath: state.vaultPath, ...body });

const projectFolder = () => (state.projectName ? `${state.baseFolder}/${state.projectName}` : '');
const taskFolder = () => (projectFolder() ? `${projectFolder()}/任务` : '');

const noteUrl = (notePath) => {
  const vault = basename(state.vaultPath);
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(notePath)}`;
};

const persist = async () => {
  try {
    await host.storage.set('settings', {
      vaultPath: state.vaultPath,
      baseFolder: state.baseFolder,
      projectName: state.projectName,
    });
  } catch {}
};

const loadSettings = async () => {
  try {
    const saved = await host.storage.get('settings');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      if (typeof saved.vaultPath === 'string' && saved.vaultPath.trim()) state.vaultPath = saved.vaultPath.trim();
      if (typeof saved.baseFolder === 'string' && saved.baseFolder.trim()) state.baseFolder = saved.baseFolder.trim().replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '');
      if (typeof saved.projectName === 'string' && saved.projectName.trim()) state.projectName = saved.projectName.trim();
    }
  } catch {}
};

const pathKey = (value) => String(value || '').trim().replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();

const isChatDirectory = (directory) => /[\\/]\.config[\\/]openchamber[\\/]chats[\\/]/i.test(String(directory || ''));

const applyDirectory = (directory) => {
  state.directory = directory || null;
};

const resolveOcProject = () => {
  const name = state.projectName.trim().toLowerCase();
  let match = name
    ? state.ocProjects.find((project) => basename(project.directory).toLowerCase() === name)
    : null;
  if (!match && state.projectDirectory) {
    match = state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.projectDirectory));
  }
  if (!match && state.directory && !isChatDirectory(state.directory)) {
    match = state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory));
  }
  state.ocProjectId = match?.id || '';
  state.ocProjectName = match?.name || '';
  state.ocProjectDirectory = match?.directory || '';
};

const loadProjects = async () => {
  const result = await rest('projects', { baseFolder: state.baseFolder });
  state.vaultProjects = Array.isArray(result?.projects) ? result.projects : [];
  try {
    const snapshot = await host.listProjects();
    state.ocProjects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
  } catch {
    state.ocProjects = [];
  }
  if (state.projectName && !state.vaultProjects.includes(state.projectName)) {
    state.projectName = '';
  }
  if (!state.projectName) {
    const byDirectory = state.directory && !isChatDirectory(state.directory)
      ? state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory))
      : null;
    const candidate = byDirectory?.name || (state.vaultProjects.length === 1 ? state.vaultProjects[0] : '');
    if (candidate && state.vaultProjects.includes(candidate)) state.projectName = candidate;
  }
  resolveOcProject();
};

const selectProject = (name) => {
  const next = String(name || '').trim();
  if (next !== state.projectName) {
    state.projectName = next;
    state.projectDirectory = '';
  }
  state.selectedPath = '';
  state.selectedNote = null;
  state.bound = false;
  void persist();
  renderAll();
  void refresh(true);
};

const loadProject = async () => {
  state.bound = false;
  if (!state.projectName) return;
  try {
    const result = await rest('note', { notePath: `${projectFolder()}/index.md` });
    state.bound = true;
    const pathValue = result?.note?.frontmatter?.path;
    if (typeof pathValue === 'string' && pathValue.trim()) state.projectDirectory = pathValue.trim();
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  resolveOcProject();
};

const loadTasks = async () => {
  if (!state.bound) {
    state.tasks = [];
    return;
  }
  const result = await rest('tasks', { folder: taskFolder(), limit: 200 });
  const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
  state.tasks = tasks
    .filter((task) => task?.frontmatter?.type === 'AgentTask')
    .sort((left, right) => {
      const leftStatus = STATUS_RANK[left?.frontmatter?.status] ?? 9;
      const rightStatus = STATUS_RANK[right?.frontmatter?.status] ?? 9;
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      const leftPriority = String(left?.frontmatter?.priority || 'P9');
      const rightPriority = String(right?.frontmatter?.priority || 'P9');
      if (leftPriority !== rightPriority) return leftPriority.localeCompare(rightPriority);
      return (right?.mtime || 0) - (left?.mtime || 0);
    });
};

const loadSelected = async () => {
  if (!state.selectedPath) {
    state.selectedNote = null;
    return;
  }
  try {
    const result = await rest('note', { notePath: state.selectedPath });
    state.selectedNote = result?.note ?? null;
  } catch (error) {
    if (error?.status === 404) {
      state.selectedPath = '';
      state.selectedNote = null;
      return;
    }
    throw error;
  }
};

const refresh = async (quiet) => {
  if (state.busy) return;
  state.busy = true;
  state.error = null;
  renderHeader();
  renderError();
  try {
    await loadProjects();
    await loadProject();
    await loadTasks();
    if (state.selectedPath && !state.tasks.some((task) => task.path === state.selectedPath)) {
      state.selectedPath = '';
      state.selectedNote = null;
    }
    await loadSelected();
    if (!quiet) say(state.bound
      ? `Loaded ${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'} from ${state.vaultPath}.`
      : `Vault ${state.vaultPath} is reachable. ${state.vaultProjects.length} project${state.vaultProjects.length === 1 ? '' : 's'} found.`);
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    renderAll();
  }
};

const boot = async () => {
  if (state.booted) return;
  state.booted = true;
  await loadSettings();
  nodes.vault.value = state.vaultPath;
  await refresh(true);
};

const taskTitle = (task) => {
  const title = String(task?.frontmatter?.title || '').trim();
  return title || task?.name || 'Untitled task';
};

const taskStatus = (task) => {
  const value = String(task?.frontmatter?.status || 'todo').toLowerCase();
  return STATUSES.includes(value) ? value : 'todo';
};

const badge = (label, tone) => el('span', `badge ${tone || 'tone-muted'}`, label);

const emptyBlock = (text, actionLabel, action) => {
  const wrap = el('div', 'empty');
  wrap.append(el('p', '', text));
  if (actionLabel && action) {
    const button = el('button', 'primary', actionLabel);
    button.type = 'button';
    button.disabled = state.busy;
    button.addEventListener('click', action);
    wrap.append(button);
  }
  return wrap;
};

const renderProjects = () => {
  const signature = `${state.vaultProjects.join('\u0000')}\u0001${state.projectName}`;
  if (signature !== state.projectSignature || nodes.projectSelect.options.length === 0) {
    state.projectSignature = signature;
    const options = [];
    const placeholder = el('option', '', state.vaultProjects.length ? 'Select project…' : 'No vault projects yet');
    placeholder.value = '';
    options.push(placeholder);
    for (const name of state.vaultProjects) {
      const option = el('option', '', name);
      option.value = name;
      options.push(option);
    }
    if (state.projectName && !state.vaultProjects.includes(state.projectName)) {
      const pending = el('option', '', `${state.projectName} (not initialized)`);
      pending.value = state.projectName;
      options.push(pending);
    }
    nodes.projectSelect.replaceChildren(...options);
  }
  nodes.projectSelect.value = state.projectName;
  nodes.projectSelect.disabled = state.busy;
  if (!state.projectName) {
    nodes.projectPath.textContent = `No project selected · ${state.baseFolder}`;
    nodes.projectPath.title = nodes.projectPath.textContent;
    return;
  }
  const suffix = state.ocProjectId
    ? ` · session project: ${state.ocProjectName}`
    : ' · no matching OpenChamber project';
  nodes.projectPath.textContent = `${projectFolder()}${suffix}`;
  nodes.projectPath.title = state.ocProjectDirectory || nodes.projectPath.textContent;
};

const renderHeader = () => {
  if (document.activeElement !== nodes.vault) nodes.vault.value = state.vaultPath;
  renderProjects();
  nodes.bind.disabled = state.busy || !state.projectName || state.bound;
  nodes.bind.textContent = state.bound ? 'Initialized' : 'Initialize';
  nodes.openVault.disabled = state.busy || !state.bound;
  nodes.refresh.disabled = state.busy;
  nodes.newProject.disabled = state.busy;
  nodes.newTask.disabled = state.busy;
  nodes.vault.disabled = state.busy;
};

const renderError = () => {
  nodes.error.hidden = !state.error;
  nodes.error.textContent = state.error || '';
};

const renderActivity = () => {
  nodes.activity.textContent = state.activity;
  nodes.activity.title = state.activity;
};

const renderFilters = () => {
  for (const button of nodes.filters.querySelectorAll('button[data-filter]')) {
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  }
};

const renderTasks = () => {
  const visible = state.tasks.filter((task) => state.filter === 'all' || taskStatus(task) === state.filter);
  nodes.count.textContent = String(state.tasks.length);
  if (!state.projectName) {
    nodes.tasks.replaceChildren(emptyBlock(
      `Brain is the control page of this Obsidian extension. It reads ${state.vaultPath} and keeps one folder per project under ${state.baseFolder}.`,
      'New project',
      openProjectDialog,
    ));
    return;
  }
  if (!state.bound) {
    nodes.tasks.replaceChildren(emptyBlock(
      `${projectFolder()} has no index.md yet. Initialize it to create the project index and a task folder.`,
      'Initialize project',
      () => void bindProject(),
    ));
    return;
  }
  if (!state.tasks.length) {
    nodes.tasks.replaceChildren(emptyBlock('No task cards yet.', 'New task', openTaskDialog));
    return;
  }
  if (!visible.length) {
    nodes.tasks.replaceChildren(el('p', 'empty', `No ${state.filter} tasks.`));
    return;
  }
  nodes.tasks.replaceChildren(...visible.map((task) => {
    const status = taskStatus(task);
    const card = el('button', 'task');
    card.type = 'button';
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(task.path === state.selectedPath));
    card.dataset.path = task.path;
    card.append(
      el('span', 'task-title', taskTitle(task)),
      (() => {
        const meta = el('span', 'task-meta');
        meta.append(
          badge(STATUS_LABEL[status], STATUS_TONE[status]),
          badge(String(task?.frontmatter?.priority || 'P1'), PRIORITY_TONE[String(task?.frontmatter?.priority || 'P1')] || 'tone-muted'),
          el('span', '', String(task?.frontmatter?.assigned_agent || 'opencode')),
        );
        return meta;
      })(),
    );
    return card;
  }));
};

const splitSections = (content) => {
  const body = String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const firstLine = body.match(/^\s*#\s+(.+)$/m);
  const parts = body.split(/^##\s+/m);
  const sections = parts.slice(1).map((chunk) => {
    const newline = chunk.indexOf('\n');
    const title = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
    const text = newline === -1 ? '' : chunk.slice(newline + 1).trim();
    return { title, text };
  });
  return { title: firstLine ? firstLine[1].trim() : '', sections };
};

const setStatus = async (status) => {
  if (!state.selectedPath) return;
  const path = state.selectedPath;
  state.busy = true;
  renderHeader();
  try {
    await rest('frontmatter', { notePath: path, key: 'status', value: status });
    await rest('frontmatter', { notePath: path, key: 'updated_at', value: stamp() });
    await rest('append', {
      notePath: path,
      heading: 'Agent Execution Log',
      content: `- [${stamp()}] status → ${status} (Brain)`,
    });
    say(`${path} → ${status}.`);
    await loadTasks();
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    renderAll();
  }
};

const appendLog = async (text) => {
  const content = String(text || '').trim();
  if (!content || !state.selectedPath) return;
  state.busy = true;
  renderHeader();
  try {
    await rest('append', {
      notePath: state.selectedPath,
      heading: 'Agent Execution Log',
      content: `- [${stamp()}] ${content}`,
    });
    await rest('frontmatter', { notePath: state.selectedPath, key: 'updated_at', value: stamp() });
    say('Log line appended.');
    await loadTasks();
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    renderAll();
  }
};

const buildBrief = (note, taskPath) => {
  const { title, sections } = splitSections(note?.content);
  const pick = (name) => sections.find((section) => section.title.toLowerCase() === name.toLowerCase())?.text || '';
  const spec = pick('Task Spec');
  const criteria = pick('Acceptance Criteria');
  const heading = title || basename(taskPath).replace(/\.md$/i, '');
  const brief = [
    `Obsidian task card: ${taskPath} (vault ${state.vaultPath}).`,
    `Project: ${state.projectName}.`,
    'Follow the vault AGENTS.md rules for any note write.',
    '',
    `# ${heading}`,
    '',
    '## Task Spec',
    spec || '_Not specified._',
    '',
    '## Acceptance Criteria',
    criteria || '_Not specified._',
    '',
    'Work this task now. When finished, set status in the task frontmatter (done or blocked) and append a short result under "## Agent Execution Log".',
  ].join('\n');
  return brief.slice(0, 15000);
};

const dispatch = async () => {
  if (!state.selectedNote || !state.selectedPath) return;
  const taskPath = state.selectedPath;
  const title = splitSections(state.selectedNote.content).title || basename(taskPath).replace(/\.md$/i, '');
  const brief = buildBrief(state.selectedNote, taskPath);
  state.busy = true;
  renderHeader();
  try {
    const result = await host.startSession({
      providerId: 'obsidian',
      id: taskPath,
      title,
      url: noteUrl(taskPath),
      text: brief,
      ...(state.ocProjectId ? { projectId: state.ocProjectId } : {}),
      navigation: 'open',
    });
    if (!result?.sessionId) {
      throw new Error(result?.failure ? `Session failed: ${result.failure}` : 'Session was not created');
    }
    await rest('frontmatter', { notePath: taskPath, key: 'status', value: 'running' });
    await rest('frontmatter', { notePath: taskPath, key: 'session_id', value: result.sessionId });
    await rest('frontmatter', { notePath: taskPath, key: 'updated_at', value: stamp() });
    await rest('append', {
      notePath: taskPath,
      heading: 'Agent Execution Log',
      content: `- [${stamp()}] dispatched to session ${result.sessionId} (Brain)`,
    });
    say(`Dispatched ${title} to session ${result.sessionId}.`);
    await toast('success', `Dispatched to session ${result.sessionId}`);
    await loadTasks();
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    renderAll();
  }
};

const compose = async () => {
  if (!state.selectedNote || !state.selectedPath) return;
  try {
    await host.prompt({ text: buildBrief(state.selectedNote, state.selectedPath), send: false });
    say('Task brief placed in the current composer.');
  } catch (error) {
    state.error = messageOf(error);
    renderError();
  }
};

const openNote = async (notePath) => {
  try {
    await rest('open', { notePath, newLeaf: true });
    say(`Opened ${notePath} in Obsidian.`);
  } catch (error) {
    state.error = messageOf(error);
    renderError();
  }
};

const renderDetail = () => {
  if (!state.selectedNote) {
    if (!state.projectName) {
      nodes.detail.replaceChildren(
        el('h1', '', 'Brain'),
        el('p', 'path', `${state.vaultPath} · ${state.baseFolder}`),
        el('p', 'empty', 'This page belongs to the Obsidian panel extension: it shares the same vault, service, and MCP bridge as the right-side panel.'),
        el('p', 'empty', 'Create a project, initialize its folder in the vault, then add task cards and dispatch them to an agent session.'),
      );
      return;
    }
    nodes.detail.replaceChildren(
      el('h1', '', state.projectName),
      el('p', 'path', projectFolder()),
      el('p', 'empty', state.bound
        ? 'Select a task card to inspect it.'
        : 'This project is not initialized yet. Use Initialize in the header.'),
      el('p', 'empty', 'Dispatch sends the task card to a new agent session; Compose writes the brief into the current chat.'),
    );
    return;
  }
  const note = state.selectedNote;
  const frontmatter = note.frontmatter || {};
  const status = STATUSES.includes(String(frontmatter.status)) ? String(frontmatter.status) : 'todo';
  const parsed = splitSections(note.content);
  const fragment = document.createDocumentFragment();

  fragment.append(el('h1', '', parsed.title || basename(note.path).replace(/\.md$/i, '')));
  fragment.append(el('p', 'path', note.path));

  const meta = el('div', 'meta');
  meta.append(
    badge(STATUS_LABEL[status], STATUS_TONE[status]),
    badge(String(frontmatter.priority || 'P1'), PRIORITY_TONE[String(frontmatter.priority || 'P1')] || 'tone-muted'),
    el('span', '', `agent: ${frontmatter.assigned_agent || 'opencode'}`),
    el('span', '', `task: ${frontmatter.task_id || '—'}`),
    el('span', '', `updated: ${frontmatter.updated_at || '—'}`),
  );
  if (frontmatter.session_id) meta.append(el('span', '', `session: ${frontmatter.session_id}`));
  fragment.append(meta);

  const actions = el('div', 'actions');
  for (const value of STATUSES) {
    const button = el('button', '', STATUS_LABEL[value]);
    button.type = 'button';
    button.disabled = state.busy || value === status;
    button.addEventListener('click', () => void setStatus(value));
    actions.append(button);
  }
  const dispatchButton = el('button', 'primary', 'Dispatch to agent');
  dispatchButton.type = 'button';
  dispatchButton.disabled = state.busy;
  dispatchButton.title = state.ocProjectId
    ? `Create a new session in ${state.ocProjectName}`
    : 'Create a new session; no OpenChamber project matches this vault project, so it opens in the current directory';
  dispatchButton.addEventListener('click', () => void dispatch());
  actions.append(dispatchButton);

  const composeButton = el('button', '', 'Compose in chat');
  composeButton.type = 'button';
  composeButton.disabled = state.busy;
  composeButton.addEventListener('click', () => void compose());
  actions.append(composeButton);

  const openButton = el('button', '', 'Open in Obsidian');
  openButton.type = 'button';
  openButton.disabled = state.busy;
  openButton.addEventListener('click', () => void openNote(note.path));
  actions.append(openButton);
  fragment.append(actions);

  const logForm = el('form', 'log');
  const logInput = el('input');
  logInput.type = 'text';
  logInput.placeholder = 'Append a line to Agent Execution Log';
  logInput.maxLength = 2000;
  const logButton = el('button', 'primary', 'Append');
  logButton.type = 'submit';
  logButton.disabled = state.busy;
  logForm.append(logInput, logButton);
  logForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = logInput.value;
    logInput.value = '';
    void appendLog(value);
  });
  fragment.append(logForm);

  const shown = new Set(['task spec', 'acceptance criteria', 'agent execution log']);
  for (const section of parsed.sections) {
    if (!section.title) continue;
    const details = el('details', 'section');
    details.open = shown.has(section.title.toLowerCase());
    details.append(el('summary', '', section.title), el('pre', '', section.text || '_Empty._'));
    fragment.append(details);
  }
  if (!parsed.sections.length) fragment.append(el('p', 'empty', 'This note has no sections yet.'));

  nodes.detail.replaceChildren(fragment);
};

const renderAll = () => {
  renderHeader();
  renderError();
  renderFilters();
  renderTasks();
  renderDetail();
  renderActivity();
};

const selectTask = async (taskPath) => {
  if (!taskPath || state.busy) return;
  state.selectedPath = taskPath;
  state.busy = true;
  renderHeader();
  renderTasks();
  try {
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    renderAll();
  }
};

const bindProject = async () => {
  if (!state.projectName || state.busy) return;
  state.busy = true;
  state.error = null;
  renderHeader();
  try {
    await rest('project/init', {
      baseFolder: state.baseFolder,
      project: state.projectName,
      projectPath: state.projectDirectory || '',
    });
    state.bound = true;
    if (!state.vaultProjects.includes(state.projectName)) {
      state.vaultProjects = [...state.vaultProjects, state.projectName].sort((left, right) => left.localeCompare(right, 'zh'));
    }
    say(`Initialized ${state.projectName} in ${projectFolder()}.`);
    await toast('success', `Initialized ${state.projectName}`);
    await loadProject();
    await loadTasks();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    renderAll();
  }
};

const createProject = async () => {
  const rawName = nodes.pName.value.trim();
  const name = rawName.replace(/[\\/]+/g, ' ').replace(/\.\./g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) {
    nodes.pName.focus();
    return;
  }
  const directory = nodes.pPath.value.trim().slice(0, 1024);
  nodes.projectForm.querySelectorAll('button, input').forEach((node) => { node.disabled = true; });
  try {
    await rest('project/init', { baseFolder: state.baseFolder, project: name, projectPath: directory });
    state.projectName = name;
    state.projectDirectory = directory;
    state.bound = true;
    state.vaultProjects = [...new Set([...state.vaultProjects, name])].sort((left, right) => left.localeCompare(right, 'zh'));
    state.selectedPath = '';
    state.selectedNote = null;
    nodes.projectDialog.close();
    nodes.projectForm.reset();
    await persist();
    say(`Created ${state.baseFolder}/${name}.`);
    await toast('success', `Created project ${name}`);
    await loadProjects();
    await loadProject();
    await loadTasks();
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    nodes.projectForm.querySelectorAll('button, input').forEach((node) => { node.disabled = false; });
    renderAll();
  }
};

const openProjectDialog = () => {
  if (state.busy) return;
  nodes.pName.value = '';
  nodes.pPath.value = state.projectDirectory || '';
  nodes.projectDialog.showModal();
  nodes.pName.focus();
};

const openTaskDialog = async () => {
  if (state.busy) return;
  if (!state.projectName) {
    say('Create a project first.');
    openProjectDialog();
    return;
  }
  if (!state.bound) await bindProject();
  if (!state.bound) return;
  nodes.fTitle.value = '';
  nodes.fSpec.value = '';
  nodes.fCriteria.value = '';
  nodes.dialog.showModal();
  nodes.fTitle.focus();
};

const createTask = async () => {
  if (!state.projectName) {
    openProjectDialog();
    return;
  }
  if (!state.bound) await bindProject();
  if (!state.bound) return;
  const title = nodes.fTitle.value.trim();
  if (!title) {
    nodes.fTitle.focus();
    return;
  }
  const body = {
    folder: taskFolder(),
    title,
    project: state.projectName,
    priority: nodes.fPriority.value,
    assigned_agent: nodes.fAgent.value.trim() || 'opencode',
    spec: nodes.fSpec.value,
    criteria: nodes.fCriteria.value,
  };
  nodes.form.querySelectorAll('button, input, textarea, select').forEach((node) => { node.disabled = true; });
  try {
    const result = await rest('task/create', body);
    nodes.dialog.close();
    nodes.form.reset();
    nodes.fAgent.value = 'opencode';
    state.selectedPath = result?.path || result?.task?.path || '';
    say(`Created ${state.selectedPath}.`);
    await loadTasks();
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    nodes.form.querySelectorAll('button, input, textarea, select').forEach((node) => { node.disabled = false; });
    renderAll();
  }
};

nodes.tasks.addEventListener('click', (event) => {
  const card = event.target.closest('.task');
  if (!card?.dataset.path) return;
  void selectTask(card.dataset.path);
});

nodes.filters.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  renderFilters();
  renderTasks();
});

nodes.refresh.addEventListener('click', () => void refresh(false));
nodes.bind.addEventListener('click', () => void bindProject());
nodes.newProject.addEventListener('click', openProjectDialog);
nodes.openVault.addEventListener('click', () => {
  if (state.bound) void openNote(`${projectFolder()}/index.md`);
});
nodes.newTask.addEventListener('click', () => void openTaskDialog());
nodes.fCancel.addEventListener('click', () => nodes.dialog.close());
nodes.form.addEventListener('submit', (event) => {
  event.preventDefault();
  void createTask();
});

nodes.pCancel.addEventListener('click', () => nodes.projectDialog.close());
nodes.projectForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void createProject();
});

nodes.vault.addEventListener('change', () => {
  const value = nodes.vault.value.trim();
  if (!value) {
    nodes.vault.value = state.vaultPath;
    return;
  }
  if (value === state.vaultPath) return;
  state.vaultPath = value;
  state.projectName = '';
  state.projectDirectory = '';
  state.vaultProjects = [];
  state.selectedPath = '';
  state.selectedNote = null;
  void persist();
  void refresh(false);
});

nodes.vault.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    nodes.vault.blur();
  }
});

nodes.projectSelect.addEventListener('change', () => {
  selectProject(nodes.projectSelect.value);
});

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  applyDirectory(context?.directory);
  renderHeader();
  if (!state.ready) {
    state.ready = true;
    void boot();
  } else {
    void refresh(true);
  }
});

host.onDirectory((directory) => {
  applyDirectory(directory);
  state.selectedPath = '';
  state.selectedNote = null;
  renderHeader();
  renderDetail();
  void refresh(true);
});

renderAll();
