import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

const host = connectHost();

const nodes = {
  vault: document.querySelector('#vault'),
  projectSelect: document.querySelector('#project-select'),
  projectPath: document.querySelector('#project-path'),
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
};

const state = {
  ready: false,
  booted: false,
  busy: false,
  vaultPath: 'D:\\brain',
  baseFolder: '20-笔记/项目',
  directory: null,
  projects: [],
  projectId: '',
  projectSignature: '',
  projectName: '',
  projectDirectory: '',
  pinnedProjectId: '',
  bound: false,
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
    });
  } catch {}
};

const loadSettings = async () => {
  try {
    const saved = await host.storage.get('settings');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      if (typeof saved.vaultPath === 'string' && saved.vaultPath.trim()) state.vaultPath = saved.vaultPath.trim();
      if (typeof saved.baseFolder === 'string' && saved.baseFolder.trim()) state.baseFolder = saved.baseFolder.trim().replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '');
    }
  } catch {}
};

const pathKey = (value) => String(value || '').trim().replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();

const isChatDirectory = (directory) => /[\\/]\.config[\\/]openchamber[\\/]chats[\\/]/i.test(String(directory || ''));

const applyDirectory = (directory) => {
  state.directory = directory || null;
  state.pinnedProjectId = '';
};

const applyProject = () => {
  const project = state.projects.find((item) => item.id === state.projectId) || null;
  state.projectName = project?.name || '';
  state.projectDirectory = project?.directory || '';
};

const resolveProject = async () => {
  const pinned = state.pinnedProjectId && state.projects.some((item) => item.id === state.pinnedProjectId)
    ? state.pinnedProjectId
    : '';
  let resolved = pinned;
  if (!resolved) {
    const key = pathKey(state.directory || '');
    if (key && !isChatDirectory(state.directory)) {
      const direct = state.projects.find((project) => pathKey(project.directory) === key);
      if (direct) resolved = direct.id;
      if (!resolved) {
        for (const project of state.projects) {
          try {
            const snapshot = await host.listWorktrees(project.id);
            const worktrees = Array.isArray(snapshot?.worktrees) ? snapshot.worktrees : [];
            if (worktrees.some((worktree) => pathKey(worktree.directory) === key)) {
              resolved = project.id;
              break;
            }
          } catch {}
        }
      }
    }
  }
  state.projectId = resolved;
  applyProject();
};

const loadProjects = async () => {
  try {
    const snapshot = await host.listProjects();
    state.projects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
  } catch {
    state.projects = [];
  }
  if (state.pinnedProjectId && !state.projects.some((item) => item.id === state.pinnedProjectId)) {
    state.pinnedProjectId = '';
  }
  await resolveProject();
};

const selectProject = (id) => {
  state.pinnedProjectId = id;
  state.projectId = id;
  applyProject();
  state.selectedPath = '';
  state.selectedNote = null;
  state.bound = false;
  renderAll();
  void refresh(true);
};

const loadProject = async () => {
  state.bound = false;
  if (!state.projectName) return;
  try {
    await rest('note', { notePath: `${projectFolder()}/index.md` });
    state.bound = true;
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
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
    if (!quiet) say(`Loaded ${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'} from ${state.vaultPath}.`);
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

const renderProjects = () => {
  const signature = state.projects.map((project) => `${project.id}\u0000${project.name}`).join('\u0001');
  if (signature !== state.projectSignature || nodes.projectSelect.options.length === 0) {
    state.projectSignature = signature;
    const options = [el('option', '', state.projects.length ? 'Choose project…' : 'No project registered')];
    options[0].value = '';
    for (const project of state.projects) {
      const option = el('option', '', project.name);
      option.value = project.id;
      options.push(option);
    }
    nodes.projectSelect.replaceChildren(...options);
  }
  nodes.projectSelect.value = state.projectId;
  nodes.projectSelect.disabled = state.busy || state.projects.length === 0;
  nodes.projectPath.textContent = state.projectDirectory
    || (state.projects.length
      ? 'Choose a project to load its task cards'
      : 'No OpenChamber project registered. Add one with +, then reopen Brain');
};

const renderHeader = () => {
  if (document.activeElement !== nodes.vault) nodes.vault.value = state.vaultPath;
  renderProjects();
  nodes.bind.disabled = state.busy || !state.projectId || state.bound;
  nodes.bind.textContent = state.bound ? 'Bound' : 'Bind project';
  nodes.openVault.disabled = state.busy || !state.bound;
  nodes.refresh.disabled = state.busy;
  nodes.newTask.disabled = state.busy || !state.bound;
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
  if (!state.projectId) {
    nodes.tasks.replaceChildren(el('p', 'empty', state.projects.length
      ? 'Choose a project in the header to load its task cards.'
      : 'No OpenChamber project registered yet. Add one in the app, then reopen Brain.'));
    return;
  }
  if (!state.bound) {
    nodes.tasks.replaceChildren(el('p', 'empty', 'No vault folder for this project yet. Use Bind project to create one.'));
    return;
  }
  if (!state.tasks.length) {
    nodes.tasks.replaceChildren(el('p', 'empty', 'No task cards yet. Create one with New task.'));
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
      ...(state.projectId ? { projectId: state.projectId } : {}),
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
    nodes.detail.replaceChildren(
      el('p', 'empty', state.projectId
        ? 'Select a task card to inspect it.'
        : 'No project selected. Choose one in the header to load its tasks.'),
      el('p', 'empty', state.projectId && !state.bound
        ? 'Bind this project first if the vault has no folder for it yet.'
        : 'Dispatch sends the task card to a new agent session; Compose writes the brief into the current chat.'),
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
  dispatchButton.disabled = state.busy || !state.projectId;
  dispatchButton.title = state.projectId ? 'Create a new session in the selected project' : 'Choose a project first';
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
  if (!state.projectId || state.busy) return;
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
    say(`Bound ${state.projectName} to ${projectFolder()}.`);
    await toast('success', `Bound ${state.projectName}`);
    await loadTasks();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    renderAll();
  }
};

const createTask = async () => {
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
    renderError();
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
nodes.openVault.addEventListener('click', () => {
  if (state.bound) void openNote(`${projectFolder()}/index.md`);
});
nodes.newTask.addEventListener('click', () => {
  if (!state.bound) return;
  nodes.fTitle.value = '';
  nodes.fSpec.value = '';
  nodes.fCriteria.value = '';
  nodes.dialog.showModal();
  nodes.fTitle.focus();
});
nodes.fCancel.addEventListener('click', () => nodes.dialog.close());
nodes.form.addEventListener('submit', (event) => {
  event.preventDefault();
  void createTask();
});

nodes.vault.addEventListener('change', () => {
  const value = nodes.vault.value.trim();
  if (!value) {
    nodes.vault.value = state.vaultPath;
    return;
  }
  if (value === state.vaultPath) return;
  state.vaultPath = value;
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
