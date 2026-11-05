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
  sessionsPanel: document.querySelector('#sessions-panel'),
  sessions: document.querySelector('#sessions'),
  sessionCount: document.querySelector('#session-count'),
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
  fSession: document.querySelector('#f-session'),
  fCancel: document.querySelector('#f-cancel'),
  projectDialog: document.querySelector('#project-dialog'),
  projectForm: document.querySelector('#project-form'),
  pName: document.querySelector('#p-name'),
  pCancel: document.querySelector('#p-cancel'),
  pCreate: document.querySelector('#p-create'),
  pError: document.querySelector('#p-error'),
  fSubmit: document.querySelector('#f-submit'),
  fError: document.querySelector('#f-error'),
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
  sessions: [],
  sessionId: '',
  tasks: [],
  filter: 'all',
  selectedPath: '',
  selectedNote: null,
  error: null,
  activity: '就绪。',
};

const STATUSES = ['todo', 'running', 'blocked', 'done'];
const STATUS_LABEL = { todo: '待办', running: '进行中', blocked: '阻塞', done: '已完成' };
const FILTER_LABEL = { all: '全部', todo: '待办', running: '进行中', blocked: '阻塞', done: '已完成' };
const ACTIVITY_LABEL = {
  unknown: '未知',
  idle: '空闲',
  running: '运行中',
  retrying: '重试中',
  'waiting-permission': '等待授权',
  'waiting-question': '等待回答',
};
const STATUS_TONE = { todo: 'tone-muted', running: 'tone-info', blocked: 'tone-warning', done: 'tone-success' };
const PRIORITY_TONE = { P0: 'tone-error', P1: 'tone-warning', P2: 'tone-info', P3: 'tone-muted' };
const STATUS_RANK = { running: 0, todo: 1, blocked: 2, done: 3 };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const messageOf = (error) => (error instanceof Error ? error.message : String(error || '未知错误'));

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

const setDialogMessage = (node, text) => {
  if (!node) return;
  node.hidden = !text;
  node.textContent = text || '';
};

const api = async (path, body) => {
  const pending = host.serviceRequest({
    method: 'POST',
    path,
    body: JSON.stringify(body ?? {}),
  });
  const result = await Promise.race([
    pending,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`服务请求超时（20 秒）：${path}`)), 20000);
    }),
  ]);
  let parsed = null;
  try {
    parsed = result.body ? JSON.parse(result.body) : null;
  } catch {}
  if (result.status < 200 || result.status >= 300) {
    const error = new Error(parsed?.error || `服务返回 ${result.status}`);
    error.status = result.status;
    throw error;
  }
  if (parsed && parsed.ok === false) throw new Error(parsed.error || '请求失败');
  return parsed;
};

const rest = (route, body) => api(`/obsidian/rest/${route}`, { vaultPath: state.vaultPath, ...body });

const projectFolder = () => (state.projectName ? `${state.baseFolder}/${state.projectName}` : '');
const taskFolder = () => (projectFolder() ? `${projectFolder()}/任务` : '');

let serviceBase = '';

const noteUrl = async (notePath) => {
  if (!serviceBase) {
    try {
      const info = await rest('service-info', {});
      if (typeof info?.base === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(info.base)) serviceBase = info.base;
    } catch {}
  }
  if (!serviceBase) return 'https://obsidian.md';
  const vault = basename(state.vaultPath);
  return `${serviceBase}/obsidian/open?vault=${encodeURIComponent(vault)}&path=${encodeURIComponent(notePath)}`;
};

const persist = async () => {
  try {
    await host.storage.set('settings', {
      vaultPath: state.vaultPath,
      baseFolder: state.baseFolder,
      projectName: state.projectName,
      ocProjectId: state.ocProjectId,
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
      if (typeof saved.ocProjectId === 'string' && saved.ocProjectId.trim()) state.ocProjectId = saved.ocProjectId.trim();
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
  let selected = state.ocProjects.find((project) => project.id === state.ocProjectId) || null;
  if (!selected && state.projectName) {
    selected = state.ocProjects.find((project) => project.name === state.projectName) || null;
  }
  if (!selected && state.directory && !isChatDirectory(state.directory)) {
    selected = state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory)) || null;
  }
  if (!selected && !state.projectName && state.ocProjects.length) selected = state.ocProjects[0];
  if (selected) {
    state.ocProjectId = selected.id;
    state.ocProjectName = selected.name;
    state.ocProjectDirectory = selected.directory;
    state.projectName = selected.name;
    state.projectDirectory = selected.directory;
  } else {
    state.ocProjectId = '';
    state.ocProjectName = '';
    state.ocProjectDirectory = '';
    if (state.projectName && !state.vaultProjects.includes(state.projectName)) state.projectName = '';
    if (!state.projectName && state.vaultProjects.length === 1) state.projectName = state.vaultProjects[0];
  }
  resolveOcProject();
};

const loadSessions = async () => {
  if (!state.ocProjectId) {
    state.sessions = [];
    state.sessionId = '';
    return;
  }
  try {
    const snapshot = await host.listSessions(state.ocProjectId);
    const records = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
    state.sessions = records
      .filter((session) => !session.archivedAt)
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  } catch {
    state.sessions = [];
  }
  if (state.sessionId && !state.sessions.some((session) => session.id === state.sessionId)) {
    state.sessionId = '';
  }
};

const selectProject = (name) => {
  const next = String(name || '').trim();
  if (next !== state.projectName) {
    state.projectName = next;
    state.projectDirectory = '';
  }
  state.ocProjectId = '';
  state.ocProjectName = '';
  state.ocProjectDirectory = '';
  state.sessions = [];
  state.sessionId = '';
  state.selectedPath = '';
  state.selectedNote = null;
  state.bound = false;
  void persist();
  renderAll();
  void refresh(true);
};

const selectOpenchamberProject = (project) => {
  state.ocProjectId = project.id;
  state.ocProjectName = project.name;
  state.ocProjectDirectory = project.directory;
  state.projectName = project.name;
  state.projectDirectory = project.directory;
  state.sessions = [];
  state.sessionId = '';
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
    if (state.projectName && !state.bound && state.ocProjectId) {
      await rest('project/init', {
        baseFolder: state.baseFolder,
        project: state.projectName,
        projectPath: state.projectDirectory || '',
      });
      if (!state.vaultProjects.includes(state.projectName)) {
        state.vaultProjects = [...state.vaultProjects, state.projectName].sort((left, right) => left.localeCompare(right, 'zh'));
      }
      await loadProject();
    }
    await loadSessions();
    await loadTasks();
    if (state.selectedPath && !state.tasks.some((task) => task.path === state.selectedPath)) {
      state.selectedPath = '';
      state.selectedNote = null;
    }
    await loadSelected();
    if (!quiet) say(state.bound
      ? `已从 ${state.vaultPath} 加载 ${state.tasks.length} 个任务。`
      : `知识库 ${state.vaultPath} 可访问，找到 ${state.vaultProjects.length} 个项目。`);
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

const projectValue = () => {
  if (state.ocProjectId) return `oc:${state.ocProjectId}`;
  if (state.projectName) return `vault:${state.projectName}`;
  return '';
};

const renderProjects = () => {
  const signature = [
    state.ocProjects.map((project) => `${project.id}\u0000${project.name}\u0000${project.directory}`).join('\u0001'),
    state.vaultProjects.join('\u0000'),
    state.projectName,
    state.ocProjectId,
  ].join('\u0002');
  if (signature !== state.projectSignature || nodes.projectSelect.options.length === 0) {
    state.projectSignature = signature;
    const options = [];
    const placeholder = el('option', '', state.ocProjects.length || state.vaultProjects.length ? '选择项目…' : '还没有任何项目');
    placeholder.value = '';
    options.push(placeholder);
    const linked = new Set(state.ocProjects.map((project) => project.name));
    const vaultOnly = state.vaultProjects.filter((name) => !linked.has(name));
    if (state.ocProjects.length) {
      const group = el('optgroup');
      group.label = 'OpenChamber 项目';
      for (const project of state.ocProjects) {
        const option = el('option', '', project.name);
        option.value = `oc:${project.id}`;
        option.title = project.directory;
        group.append(option);
      }
      options.push(group);
    }
    if (vaultOnly.length) {
      const group = el('optgroup');
      group.label = '仅知识库';
      for (const name of vaultOnly) {
        const option = el('option', '', name);
        option.value = `vault:${name}`;
        group.append(option);
      }
      options.push(group);
    }
    if (state.projectName && !linked.has(state.projectName) && !state.vaultProjects.includes(state.projectName)) {
      const pending = el('option', '', `${state.projectName}（新）`);
      pending.value = `vault:${state.projectName}`;
      options.push(pending);
    }
    nodes.projectSelect.replaceChildren(...options);
  }
  nodes.projectSelect.value = projectValue();
  nodes.projectSelect.disabled = state.busy;
  if (!state.projectName) {
    nodes.projectPath.textContent = `未选择项目 · ${state.baseFolder}`;
    nodes.projectPath.title = nodes.projectPath.textContent;
    return;
  }
  const parts = [projectFolder(), state.ocProjectDirectory || '仅知识库'];
  if (state.sessions.length) parts.push(`${state.sessions.length} 个会话`);
  nodes.projectPath.textContent = parts.join(' · ');
  nodes.projectPath.title = nodes.projectPath.textContent;
};

const activityTone = (activity) => {
  if (activity === 'idle') return 'tone-success';
  if (activity === 'running') return 'tone-info';
  if (activity === 'retrying' || activity === 'waiting-permission' || activity === 'waiting-question') return 'tone-warning';
  return 'tone-muted';
};

const sessionLabel = (session) => {
  const title = String(session?.title || '').trim();
  return title || `会话 ${String(session?.id || '').slice(0, 8)}`;
};

const populateSessionOptions = () => {
  const options = [el('option', '', '不关联会话')];
  options[0].value = '';
  for (const session of state.sessions) {
    const option = el('option', '', sessionLabel(session));
    option.value = session.id;
    options.push(option);
  }
  nodes.fSession.replaceChildren(...options);
  nodes.fSession.value = state.sessions.some((session) => session.id === state.sessionId) ? state.sessionId : '';
};

const renderSessions = () => {
  nodes.sessionsPanel.hidden = !state.ocProjectId;
  nodes.sessionCount.textContent = String(state.sessions.length);
  if (!state.ocProjectId) {
    nodes.sessions.replaceChildren();
    populateSessionOptions();
    return;
  }
  const fragment = document.createDocumentFragment();
  const none = el('button', 'session');
  none.type = 'button';
  none.setAttribute('aria-pressed', String(!state.sessionId));
  none.append(
    el('span', 'session-title', '不关联会话'),
    el('span', 'session-meta', '派发前任务暂不关联会话'),
  );
  none.addEventListener('click', () => {
    state.sessionId = '';
    renderSessions();
  });
  fragment.append(none);
  for (const session of state.sessions) {
    const row = el('button', 'session');
    row.type = 'button';
    row.setAttribute('aria-pressed', String(session.id === state.sessionId));
    const meta = el('span', 'session-meta');
    meta.append(
      badge(String(session.activity || 'unknown'), activityTone(session.activity)),
      el('span', '', session.updatedAt ? new Date(session.updatedAt).toLocaleString() : ''),
    );
    row.append(el('span', 'session-title', sessionLabel(session)), meta);
    row.addEventListener('click', () => {
      state.sessionId = session.id;
      renderSessions();
    });
    fragment.append(row);
  }
  if (!state.sessions.length) fragment.append(el('p', 'empty', '这个项目还没有会话。派发一个任务就会创建。'));
  nodes.sessions.replaceChildren(fragment);
  populateSessionOptions();
};

const renderHeader = () => {
  if (document.activeElement !== nodes.vault) nodes.vault.value = state.vaultPath;
  renderProjects();
  nodes.bind.disabled = state.busy || !state.projectName || state.bound;
  nodes.bind.textContent = state.bound ? '已初始化' : '初始化';
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
      `Brain 是这个 Obsidian 扩展的控制页。它读取 ${state.vaultPath}，并在 ${state.baseFolder} 下为每个项目保留一个文件夹。`,
      '新建项目',
      openProjectDialog,
    ));
    return;
  }
  if (!state.bound) {
    nodes.tasks.replaceChildren(emptyBlock(
      `${projectFolder()} 还没有 index.md。初始化后会生成项目索引和任务文件夹。`,
      '初始化项目',
      () => void bindProject(),
    ));
    return;
  }
  if (!state.tasks.length) {
    nodes.tasks.replaceChildren(emptyBlock('还没有任务。', '新建任务', openTaskDialog));
    return;
  }
  if (!visible.length) {
    nodes.tasks.replaceChildren(el('p', 'empty', `没有「${FILTER_LABEL[state.filter] || state.filter}」状态的任务。`));
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
    say('已追加执行日志。');
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
    `Obsidian 任务：${taskPath}（知识库 ${state.vaultPath}）。`,
    `项目：${state.projectName}。`,
    '写入笔记时遵守知识库的 AGENTS.md 规则。',
    '',
    `# ${heading}`,
    '',
    '## Task Spec',
    spec || '_未填写。_',
    '',
    '## Acceptance Criteria',
    criteria || '_未填写。_',
    '',
    '现在开始处理这个任务。完成后把任务 frontmatter 的 status 设为 done 或 blocked，并在「## Agent Execution Log」下追加一段简短结果。',
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
      url: await noteUrl(taskPath),
      text: brief,
      ...(state.ocProjectId ? { projectId: state.ocProjectId } : {}),
      navigation: 'open',
    });
    if (!result?.sessionId) {
      throw new Error(result?.failure ? `创建会话失败：${result.failure}` : '未能创建会话');
    }
    await rest('frontmatter', { notePath: taskPath, key: 'status', value: 'running' });
    await rest('frontmatter', { notePath: taskPath, key: 'session_id', value: result.sessionId });
    await rest('frontmatter', { notePath: taskPath, key: 'updated_at', value: stamp() });
    await rest('append', {
      notePath: taskPath,
      heading: 'Agent Execution Log',
      content: `- [${stamp()}] dispatched to session ${result.sessionId} (Brain)`,
    });
    say(`已将「${title}」派发到会话 ${result.sessionId}。`);
    await toast('success', `已派发到会话 ${result.sessionId}`);
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
    say('任务简报已写入当前输入框。');
  } catch (error) {
    state.error = messageOf(error);
    renderError();
  }
};

const openNote = async (notePath) => {
  try {
    await rest('open', { notePath, newLeaf: true });
    say(`已在 Obsidian 中打开 ${notePath}。`);
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
        el('p', 'empty', '这个页面属于 Obsidian 面板扩展：与右侧面板共用同一个知识库、服务和 MCP 桥接。'),
        el('p', 'empty', '先新建项目并初始化项目文件夹，再添加任务并派发给 Agent 会话。'),
      );
      return;
    }
    nodes.detail.replaceChildren(
      el('h1', '', state.projectName),
      el('p', 'path', projectFolder()),
      el('p', 'empty', state.bound
        ? '在左侧选择一个任务查看详情。'
        : '这个项目还没有初始化，点顶部的「初始化」。'),
      el('p', 'empty', '派发会新建一个 Agent 会话；写入对话只把任务说明填进当前输入框。'),
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
    el('span', '', `执行者：${frontmatter.assigned_agent || 'opencode'}`),
    el('span', '', `任务：${frontmatter.task_id || '—'}`),
    el('span', '', `更新：${frontmatter.updated_at || '—'}`),
  );
  if (frontmatter.session_id) meta.append(el('span', '', `会话：${frontmatter.session_id}`));
  fragment.append(meta);

  const actions = el('div', 'actions');
  for (const value of STATUSES) {
    const button = el('button', '', STATUS_LABEL[value]);
    button.type = 'button';
    button.disabled = state.busy || value === status;
    button.addEventListener('click', () => void setStatus(value));
    actions.append(button);
  }
  const dispatchButton = el('button', 'primary', '派发到 Agent');
  dispatchButton.type = 'button';
  dispatchButton.disabled = state.busy;
  dispatchButton.title = state.ocProjectId
    ? `在 ${state.ocProjectName} 中新建会话`
    : '新建会话；没有匹配的 OpenChamber 项目，将在当前目录打开';
  dispatchButton.addEventListener('click', () => void dispatch());
  actions.append(dispatchButton);

  const composeButton = el('button', '', '写入当前对话');
  composeButton.type = 'button';
  composeButton.disabled = state.busy;
  composeButton.addEventListener('click', () => void compose());
  actions.append(composeButton);

  const openButton = el('button', '', '在 Obsidian 打开');
  openButton.type = 'button';
  openButton.disabled = state.busy;
  openButton.addEventListener('click', () => void openNote(note.path));
  actions.append(openButton);
  fragment.append(actions);

  const logForm = el('form', 'log');
  const logInput = el('input');
  logInput.type = 'text';
  logInput.placeholder = '往「Agent Execution Log」追加一行';
  logInput.maxLength = 2000;
  const logButton = el('button', 'primary', '追加');
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
    details.append(el('summary', '', section.title), el('pre', '', section.text || '_空。_'));
    fragment.append(details);
  }
  if (!parsed.sections.length) fragment.append(el('p', 'empty', '这篇笔记还没有分节内容。'));

  nodes.detail.replaceChildren(fragment);
};

const renderAll = () => {
  renderHeader();
  renderError();
  renderFilters();
  renderSessions();
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
    say(`已初始化 ${state.projectName}（${projectFolder()}）。`);
    await toast('success', `已初始化 ${state.projectName}`);
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
  setDialogMessage(nodes.pError, '');
  const rawName = nodes.pName.value.trim();
  const name = rawName.replace(/[\\/]+/g, ' ').replace(/\.\./g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) {
    setDialogMessage(nodes.pError, '请先填写项目名称。');
    nodes.pName.focus();
    return;
  }
  if (!state.vaultPath.trim()) {
    setDialogMessage(nodes.pError, '知识库路径为空，先在顶部填写知识库路径。');
    return;
  }
  nodes.projectForm.querySelectorAll('button, input').forEach((node) => { node.disabled = true; });
  say('正在创建项目…');
  try {
    await rest('project/init', { baseFolder: state.baseFolder, project: name });
    state.projectName = name;
    state.projectDirectory = '';
    state.bound = true;
    state.vaultProjects = [...new Set([...state.vaultProjects, name])].sort((left, right) => left.localeCompare(right, 'zh'));
    state.selectedPath = '';
    state.selectedNote = null;
    nodes.projectDialog.close();
    nodes.projectForm.reset();
    setDialogMessage(nodes.pError, '');
    await persist();
    say(`已创建 ${state.baseFolder}/${name}。`);
    await toast('success', `已创建项目 ${name}`);
    await loadProjects();
    await loadProject();
    await loadTasks();
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
    setDialogMessage(nodes.pError, `创建失败：${messageOf(error)}`);
  } finally {
    nodes.projectForm.querySelectorAll('button, input').forEach((node) => { node.disabled = false; });
    renderAll();
  }
};

const openProjectDialog = () => {
  if (state.busy) return;
  nodes.pName.value = '';
  setDialogMessage(nodes.pError, '');
  nodes.projectDialog.showModal();
  nodes.pName.focus();
};

const openTaskDialog = async () => {
  if (state.busy) return;
  if (!state.projectName) {
    say('请先创建一个项目。');
    openProjectDialog();
    return;
  }
  if (!state.bound) await bindProject();
  if (!state.bound) return;
  nodes.fTitle.value = '';
  nodes.fSpec.value = '';
  nodes.fCriteria.value = '';
  setDialogMessage(nodes.fError, '');
  populateSessionOptions();
  nodes.dialog.showModal();
  nodes.fTitle.focus();
};

const createTask = async () => {
  setDialogMessage(nodes.fError, '');
  if (!state.projectName) {
    openProjectDialog();
    return;
  }
  if (!state.bound) await bindProject();
  if (!state.bound) {
    nodes.dialog.close();
    return;
  }
  const title = nodes.fTitle.value.trim();
  if (!title) {
    setDialogMessage(nodes.fError, '请先填写任务标题。');
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
    session_id: state.sessionId || '',
    session_title: state.sessions.find((session) => session.id === state.sessionId)?.title || '',
  };
  nodes.form.querySelectorAll('button, input, textarea, select').forEach((node) => { node.disabled = true; });
  try {
    const result = await rest('task/create', body);
    nodes.dialog.close();
    nodes.form.reset();
    nodes.fAgent.value = 'opencode';
    state.selectedPath = result?.path || result?.task?.path || '';
    say(`已创建 ${state.selectedPath}。`);
    await loadTasks();
    await loadSelected();
  } catch (error) {
    state.error = messageOf(error);
    setDialogMessage(nodes.fError, `创建失败：${messageOf(error)}`);
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
nodes.fSubmit.addEventListener('click', () => void createTask());
for (const field of [nodes.fTitle]) {
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void createTask();
    }
  });
}

nodes.pCancel.addEventListener('click', () => nodes.projectDialog.close());
nodes.pCreate.addEventListener('click', () => void createProject());
nodes.pName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void createProject();
  }
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
  const value = nodes.projectSelect.value;
  if (value.startsWith('oc:')) {
    const project = state.ocProjects.find((item) => item.id === value.slice(3));
    if (project) selectOpenchamberProject(project);
    return;
  }
  if (value.startsWith('vault:')) {
    selectProject(value.slice(6));
    return;
  }
  selectProject('');
});

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  applyDirectory(context?.directory);
  if (context?.session?.id) state.sessionId = context.session.id;
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
