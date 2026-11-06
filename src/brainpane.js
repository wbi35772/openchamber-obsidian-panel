import { applyHostReady } from '@openchamber/sdk/ui';

export const createBrainPane = (host, root) => {

const nodes = {
  project: root.querySelector('#project'),
  refresh: root.querySelector('#refresh'),
  error: root.querySelector('#error'),
  list: root.querySelector('#list'),
  actions: root.querySelector('#actions'),
  foot: root.querySelector('#foot'),
};

const missing = Object.entries(nodes).filter(([, node]) => !node).map(([name]) => name);
if (missing.length) {
  const fallback = nodes.list || root;
  fallback.textContent = `Brain pane markup is missing: ${missing.join(', ')}`;
  return;
}

const state = {
  vaultPath: 'D:\\brain',
  baseFolder: '20-笔记/项目',
  directory: null,
  vaultProjects: [],
  ocProjects: [],
  projectName: '',
  projectDirectory: '',
  ocProjectId: '',
  ocProjectName: '',
  bound: false,
  followHost: true,
  sessions: 0,
  tasks: [],
  selectedPath: '',
  busy: false,
  refreshing: false,
  rerun: false,
  ready: false,
  freshProject: '',
  freshOcProject: null,
  taskCreate: false,
  taskCreateFocus: false,
  notice: '',
  error: null,
  activity: '就绪。',
};

const STATUSES = ['todo', 'running', 'blocked', 'done'];
const STATUS_LABEL = { todo: '待办', running: '进行中', blocked: '阻塞', done: '已完成' };
const STATUS_RANK = { running: 0, todo: 1, blocked: 2, done: 3 };
const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };

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

const pathKey = (value) => String(value || '').trim().replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();

const stamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
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
    const error = new Error(parsed?.error || `服务返回 ${result.status}`);
    error.status = result.status;
    throw error;
  }
  if (parsed && parsed.ok === false) throw new Error(parsed.error || '请求失败');
  return parsed;
};

const rest = (route, body) => api(`/obsidian/rest/${route}`, { vaultPath: state.vaultPath, ...body });

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

const projectFolder = () => (state.projectName ? `${state.baseFolder}/${state.projectName}` : '');
const taskFolder = () => (projectFolder() ? `${projectFolder()}/任务` : '');
const archiveFolder = () => `会话记录/${state.projectName || '未归类'}`;

const taskStatus = (task) => {
  const value = String(task?.frontmatter?.status || '');
  return STATUSES.includes(value) ? value : 'todo';
};

const taskTitle = (task) => {
  const title = String(task?.frontmatter?.title || '').trim();
  if (title) return title;
  const heading = String(task?.content || '').match(/^\s*#\s+(.+)$/m);
  return heading ? heading[1].trim() : `未命名任务 · ${basename(task?.path).replace(/\.md$/i, '')}`;
};

const sortTasks = (tasks) => tasks.slice().sort((left, right) => {
  const leftStatus = STATUS_RANK[taskStatus(left)] ?? 9;
  const rightStatus = STATUS_RANK[taskStatus(right)] ?? 9;
  if (leftStatus !== rightStatus) return leftStatus - rightStatus;
  const leftPriority = PRIORITY_RANK[String(left?.frontmatter?.priority || 'P9')] ?? 9;
  const rightPriority = PRIORITY_RANK[String(right?.frontmatter?.priority || 'P9')] ?? 9;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return String(left?.path || '').localeCompare(String(right?.path || ''), 'zh');
});

const saveSettings = async () => {
  try {
    const saved = await host.storage.get('settings');
    const base = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    await host.storage.set('settings', {
      ...base,
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
      if (typeof saved.baseFolder === 'string' && saved.baseFolder.trim()) {
        state.baseFolder = saved.baseFolder.trim().replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '');
      }
      if (typeof saved.projectName === 'string' && saved.projectName.trim()) state.projectName = saved.projectName.trim();
      if (typeof saved.ocProjectId === 'string' && saved.ocProjectId.trim()) state.ocProjectId = saved.ocProjectId.trim();
    }
  } catch {}
};

const checkProject = async () => {
  state.bound = false;
  state.projectDirectory = '';
  if (!state.projectName) return;
  try {
    const result = await rest('note', { notePath: `${projectFolder()}/index.md` });
    state.bound = true;
    const pathValue = result?.note?.frontmatter?.path;
    if (typeof pathValue === 'string' && pathValue.trim()) state.projectDirectory = pathValue.trim();
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
};

const resolveProject = () => {
  const hostProject = state.followHost && state.directory
    ? state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory))
    : null;
  const byId = !hostProject && state.ocProjectId
    ? state.ocProjects.find((project) => project.id === state.ocProjectId)
    : null;
  const byName = !hostProject && !byId && state.projectName
    ? state.ocProjects.find((project) => project.name === state.projectName)
    : null;
  const byDirectory = !hostProject && !byId && !byName && state.directory && state.projectName === ''
    ? state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory))
    : null;
  const selected = hostProject || byId || byName || byDirectory || null;
  if (selected) {
    state.ocProjectId = selected.id;
    state.ocProjectName = selected.name;
    state.projectName = selected.name;
    state.projectDirectory = selected.directory;
    return;
  }
  state.ocProjectId = '';
  state.ocProjectName = '';
  if (state.projectName && !state.vaultProjects.includes(state.projectName)) {
    state.projectName = '';
    state.projectDirectory = '';
  }
  if (!state.projectName && state.ocProjects.length) {
    const first = state.ocProjects[0];
    state.ocProjectId = first.id;
    state.ocProjectName = first.name;
    state.projectName = first.name;
    state.projectDirectory = first.directory;
  } else if (!state.projectName && state.vaultProjects.length === 1) {
    state.projectName = state.vaultProjects[0];
  }
};

const loadProjects = async () => {
  const result = await rest('projects', { baseFolder: state.baseFolder });
  state.vaultProjects = Array.isArray(result?.projects) ? result.projects : [];
  try {
    const snapshot = await host.listProjects();
    state.ocProjects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
  } catch {}
  if (state.freshProject) {
    if (!state.vaultProjects.includes(state.freshProject)) state.vaultProjects.push(state.freshProject);
    state.freshProject = '';
  }
  if (state.freshOcProject && !state.ocProjects.some((project) => project.id === state.freshOcProject.id)) {
    state.ocProjects.push(state.freshOcProject);
  }
  if (state.projectName && !state.vaultProjects.includes(state.projectName)) {
    state.vaultProjects.push(state.projectName);
  }
  resolveProject();
};

const loadTasks = async () => {
  if (!state.projectName || !state.bound) {
    state.tasks = [];
    return;
  }
  const result = await rest('tasks', { folder: taskFolder(), limit: 150 });
  const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
  state.tasks = sortTasks(tasks.filter((task) => task?.frontmatter?.type === 'AgentTask'));
  if (state.selectedPath && !state.tasks.some((task) => task.path === state.selectedPath)) {
    state.selectedPath = '';
  }
};

const loadSessions = async () => {
  if (!state.ready || !state.ocProjectId) {
    state.sessions = 0;
    return;
  }
  try {
    const snapshot = await host.listSessions(state.ocProjectId);
    const records = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
    state.sessions = records.filter((session) => !session.archivedAt).length;
  } catch {
    state.sessions = 0;
  }
};

const refresh = async () => {
  if (state.refreshing) {
    state.rerun = true;
    return;
  }
  state.refreshing = true;
  state.error = null;
  render();
  try {
    await loadProjects();
    await checkProject();
    await loadSessions();
    await loadTasks();
    state.activity = state.projectName
      ? `${state.tasks.length} 个任务${state.sessions ? ` · ${state.sessions} 个会话` : ''}`
      : '选择一个项目';
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.refreshing = false;
    render();
    if (state.rerun) {
      state.rerun = false;
      void refresh();
    }
    void autoArchive();
  }
};

let autoArchiveRunning = false;
let lastAutoArchiveAt = 0;

const autoArchive = async () => {
  if (autoArchiveRunning || state.busy || state.refreshing || !state.bound) return;
  if (Date.now() - lastAutoArchiveAt < 60_000) return;
  const candidates = state.tasks.filter((task) => {
    const frontmatter = task?.frontmatter || {};
    if (!String(frontmatter.session_id || '').trim()) return false;
    return !(frontmatter.auto_archive === false || frontmatter.auto_archive === 'off');
  });
  if (!candidates.length) return;
  lastAutoArchiveAt = Date.now();
  autoArchiveRunning = true;
  let changed = false;
  try {
    for (const task of candidates) {
      try {
        const result = await rest('session/archive', {
          sessionId: String(task.frontmatter.session_id).trim(),
          notePath: task.path,
          project: state.projectName,
          folder: archiveFolder(),
          auto: true,
        });
        if (result && !result.skipped && result.path) {
          changed = true;
          state.activity = `已自动归档 ${taskTitle(task)}`;
          state.notice = `会话记录已写入 ${result.path}`;
        }
      } catch {}
    }
  } finally {
    autoArchiveRunning = false;
  }
  if (changed) {
    try {
      await loadTasks();
    } catch {}
    render();
  }
};

const archiveTask = async (task, { force = true } = {}) => {
  const sessionId = String(task?.frontmatter?.session_id || '').trim();
  if (!sessionId) {
    state.error = '这个任务还没有关联会话，请先点「派发到 Agent」。';
    render();
    return;
  }
  if (state.busy) return;
  state.busy = true;
  state.error = null;
  render();
  try {
    const result = await rest('session/archive', {
      sessionId,
      notePath: task.path,
      project: state.projectName,
      folder: archiveFolder(),
      force,
    });
    if (result?.skipped) {
      state.activity = `会话没有新内容（${result.path || '未写入'}）`;
      if (result.path) state.notice = `会话记录：${result.path}`;
    } else {
      state.activity = `已归档 ${result?.messageCount ?? 0} 条消息`;
      if (result?.path) state.notice = `会话记录已写入 ${result.path}`;
      await loadTasks();
    }
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    render();
  }
};

const COPY_MODES = [
  { mode: 'id', label: '复制会话 ID', done: '会话 ID' },
  { mode: 'link', label: '复制会话链接', done: '会话链接' },
  { mode: 'markdown', label: '复制会话 Markdown', done: '会话 Markdown' },
  { mode: 'plain', label: '复制纯文本', done: '纯文本会话' },
  { mode: 'last-answer', label: '复制最后回答', done: '最后一条回答' },
  { mode: 'last-turn', label: '复制最后一轮', done: '最后一轮对话' },
];

const copyToClipboard = async (text) => {
  if (typeof host?.writeClipboard === 'function') {
    await host.writeClipboard(text);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('当前环境不支持写入剪贴板');
};

const copySession = async (task, mode) => {
  const sessionId = String(task?.frontmatter?.session_id || '').trim();
  if (!sessionId || state.busy) return;
  const entry = COPY_MODES.find((item) => item.mode === mode);
  state.busy = true;
  state.error = null;
  render();
  try {
    const result = await rest('session/export', {
      sessionId,
      mode,
      project: state.projectName,
      includeTools: mode === 'markdown',
    });
    await copyToClipboard(String(result?.text || ''));
    const detail = mode === 'markdown' || mode === 'plain'
      ? `（${result?.messageCount ?? 0} 条消息 / ${result?.turnCount ?? 0} 轮）`
      : '';
    state.activity = `已复制${entry?.done || '会话内容'}${detail}`;
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    render();
  }
};

const buildCopyMenu = (task, sessionId) => {
  const wrap = el('div', 'copy-wrap');
  const button = el('button', 'btn', '复制 ▾');
  button.type = 'button';
  button.disabled = state.busy || !sessionId;
  button.title = sessionId
    ? '复制会话内容（对齐 OpenChamber 的复制选项）'
    : '这个任务还没有关联会话，先派发到 Agent';
  const menu = el('div', 'copy-menu');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  let detach = null;
  const closeMenu = () => {
    menu.hidden = true;
    if (detach) {
      document.removeEventListener('pointerdown', detach, true);
      detach = null;
    }
  };
  for (const item of COPY_MODES) {
    const option = el('button', 'copy-item', item.label);
    option.type = 'button';
    option.setAttribute('role', 'menuitem');
    option.addEventListener('click', () => {
      closeMenu();
      void copySession(task, item.mode);
    });
    menu.append(option);
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    menu.hidden = false;
    detach = (event) => {
      if (!wrap.contains(event.target)) closeMenu();
    };
    document.addEventListener('pointerdown', detach, true);
  });
  wrap.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  wrap.append(button, menu);
  return wrap;
};


const bindProject = async () => {
  if (state.busy || !state.projectName) return;
  state.busy = true;
  state.error = null;
  render();
  try {
    await rest('project/init', {
      baseFolder: state.baseFolder,
      project: state.projectName,
      projectPath: state.projectDirectory || '',
    });
    if (!state.vaultProjects.includes(state.projectName)) state.vaultProjects.push(state.projectName);
    state.activity = `已初始化 ${state.projectName}`;
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
  }
  await refresh();
};

let projectOptionsSignature = '';

const renderProjects = () => {
  const linked = new Set(state.ocProjects.map((project) => project.name));
  const vaultOnly = state.vaultProjects.filter((name) => !linked.has(name));
  const signature = JSON.stringify({
    oc: state.ocProjects.map((project) => [project.id, project.name, project.directory || '']),
    vault: vaultOnly,
  });
  if (signature !== projectOptionsSignature) {
    projectOptionsSignature = signature;
    const options = [];
    const placeholder = el('option', '', state.ocProjects.length || vaultOnly.length ? '选择项目…' : '还没有项目');
    placeholder.value = '';
    options.push(placeholder);
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
    const createOption = el('option', '', '＋ 新建项目…');
    createOption.value = '__new__';
    options.push(createOption);
    nodes.project.replaceChildren(...options);
  }
  const value = state.ocProjectId ? `oc:${state.ocProjectId}` : state.projectName ? `vault:${state.projectName}` : '';
  if (nodes.project.value !== value) nodes.project.value = value;
  if (nodes.project.disabled !== state.busy) nodes.project.disabled = state.busy;
};

const emptyBlock = (text, actionLabel, action) => {
  const wrap = el('div', 'empty');
  wrap.append(el('span', '', text));
  if (actionLabel && action) {
    const button = el('button', 'btn', actionLabel);
    button.type = 'button';
    button.addEventListener('click', action);
    wrap.append(document.createElement('br'), button);
  }
  return wrap;
};

const openTaskForm = () => {
  if (state.busy) return;
  state.taskCreate = true;
  state.taskCreateFocus = true;
  render();
};

const buildTaskForm = () => {
  const form = el('div', 'empty');
  const input = el('input');
  input.type = 'text';
  input.placeholder = '任务标题';
  input.style.cssText = inputStyle;
  const ok = el('button', 'btn primary', '创建');
  ok.type = 'button';
  const cancel = el('button', 'btn', '取消');
  cancel.type = 'button';
  const submit = async () => {
    const title = input.value.trim();
    if (!title || state.busy) return;
    state.busy = true;
    state.error = null;
    render();
    try {
      await rest('task/create', { folder: taskFolder(), title, project: state.projectName });
      state.taskCreate = false;
      state.taskCreateFocus = false;
      await loadTasks();
      state.activity = `已创建任务 ${title}`;
    } catch (error) {
      state.error = messageOf(error);
    } finally {
      state.busy = false;
      render();
    }
  };
  ok.addEventListener('click', () => void submit());
  cancel.addEventListener('click', () => {
    state.taskCreate = false;
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      state.taskCreate = false;
      render();
    }
  });
  form.append(input, ok, cancel);
  if (state.taskCreateFocus) {
    state.taskCreateFocus = false;
    try {
      input.focus({ preventScroll: true });
    } catch {}
  }
  return form;
};

const buildAddTask = () => {
  const wrap = el('div', 'task-add');
  const button = el('button', 'btn', '＋ 新建任务');
  button.type = 'button';
  button.addEventListener('click', openTaskForm);
  wrap.append(button);
  return wrap;
};

const renderList = () => {
  if (!state.projectName) {
    nodes.list.replaceChildren(emptyBlock('还没有可用的项目。请在 OpenChamber 里添加项目，或在完整 Brain 页面新建知识库项目。'));
    return;
  }
  if (!state.bound) {
    nodes.list.replaceChildren(emptyBlock(`${projectFolder()} 还没有初始化。`, '初始化项目', () => void bindProject()));
    return;
  }
  const parts = [];
  if (state.taskCreate) parts.push(buildTaskForm());
  if (state.tasks.length) {
    parts.push(...state.tasks.map((task) => {
      const status = taskStatus(task);
      const row = el('button', 'row');
      row.type = 'button';
      row.dataset.path = task.path;
      row.setAttribute('aria-selected', String(task.path === state.selectedPath));
      const dot = el('span', 'dot');
      dot.dataset.status = status;
      row.append(
        dot,
        el('span', 'title', taskTitle(task)),
        el('span', 'prio', String(task?.frontmatter?.priority || 'P1')),
      );
      return row;
    }));
    if (!state.taskCreate) parts.push(buildAddTask());
  } else if (!state.taskCreate) {
    parts.push(emptyBlock('这个项目还没有任务。', '＋ 新建任务', openTaskForm));
  }
  nodes.list.replaceChildren(...parts);
};

const renderActions = () => {
  const task = state.tasks.find((item) => item.path === state.selectedPath);
  nodes.actions.hidden = !task;
  if (!task) return;
  const status = taskStatus(task);
  const label = el('span', 'label', taskTitle(task));
  const statusSelect = el('select');
  statusSelect.setAttribute('aria-label', '任务状态');
  for (const value of STATUSES) {
    const option = el('option', '', STATUS_LABEL[value]);
    option.value = value;
    statusSelect.append(option);
  }
  statusSelect.value = status;
  statusSelect.disabled = state.busy;
  statusSelect.addEventListener('change', () => void setStatus(task.path, statusSelect.value));

  const dispatchButton = el('button', 'btn primary', '派发到 Agent');
  dispatchButton.type = 'button';
  dispatchButton.disabled = state.busy;
  dispatchButton.title = state.ocProjectId
    ? `在 ${state.ocProjectName} 新建会话并打开`
    : '新建会话；这个知识库项目没有匹配的 OpenChamber 项目，会在当前目录打开';
  dispatchButton.addEventListener('click', () => void dispatch(task));

  const sessionId = String(task?.frontmatter?.session_id || '').trim();
  const archivedPath = String(task?.frontmatter?.archive_path || '').trim();
  const archiveButton = el('button', 'btn', archivedPath ? '更新归档' : '归档会话');
  archiveButton.type = 'button';
  archiveButton.disabled = state.busy || !sessionId;
  archiveButton.title = sessionId
    ? `把会话记录写入 ${archiveFolder()}，并回写任务卡`
    : '这个任务还没有关联会话，先派发到 Agent';
  archiveButton.addEventListener('click', () => void archiveTask(task, { force: true }));

  const archiveOpenButton = archivedPath
    ? el('button', 'btn', '打开归档')
    : null;
  if (archiveOpenButton) {
    archiveOpenButton.type = 'button';
    archiveOpenButton.disabled = state.busy;
    archiveOpenButton.addEventListener('click', () => void openNote(archivedPath));
  }

  const copyMenu = buildCopyMenu(task, sessionId);

  const composeButton = el('button', 'btn', '写入对话');
  composeButton.type = 'button';
  composeButton.disabled = state.busy;
  composeButton.addEventListener('click', () => void compose(task));

  const openButton = el('button', 'btn', '打开');
  openButton.type = 'button';
  openButton.disabled = state.busy;
  openButton.addEventListener('click', () => void openNote(task.path));

  nodes.actions.replaceChildren(
    label,
    statusSelect,
    dispatchButton,
    archiveButton,
    ...(archiveOpenButton ? [archiveOpenButton] : []),
    copyMenu,
    composeButton,
    openButton,
  );
};

const render = () => {
  nodes.error.hidden = !state.error;
  nodes.error.textContent = state.error || '';
  nodes.refresh.disabled = state.busy;
  nodes.refresh.classList.toggle('spin', state.busy || state.refreshing);
  renderProjects();
  renderList();
  renderActions();
  if (notice) {
    notice.hidden = !state.notice;
    notice.textContent = state.notice;
  }
  const parts = [state.activity];
  if (state.ocProjectId) parts.push(`会话 ${state.sessions}`);
  nodes.foot.textContent = parts.filter(Boolean).join(' · ');
  nodes.foot.title = nodes.foot.textContent;
};

const buildBrief = (task) => {
  const body = String(task?.content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  const heading = taskTitle(task);
  return [
    `Obsidian 任务：${task.path}（知识库 ${state.vaultPath}）`,
    `项目：${state.projectName}`,
    '按知识库 AGENTS.md 的规则写入笔记。',
    '',
    `# ${heading}`,
    '',
    body.slice(0, 12000),
    '',
    '现在执行这个任务。完成后把任务 frontmatter 的 status 改为 done 或 blocked，并在「## Agent Execution Log」下追加一条简短结果。',
  ].join('\n').slice(0, 15000);
};

const setStatus = async (taskPath, value) => {
  if (state.busy || !taskPath || !STATUSES.includes(value)) return;
  state.busy = true;
  render();
  try {
    await rest('frontmatter', { notePath: taskPath, key: 'status', value });
    await rest('frontmatter', { notePath: taskPath, key: 'updated_at', value: stamp() });
    await rest('append', {
      notePath: taskPath,
      heading: 'Agent Execution Log',
      content: `- [${stamp()}] status → ${value} (Brain 侧栏)`,
    });
    await loadTasks();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    render();
  }
};

const dispatch = async (task) => {
  if (state.busy || !task) return;
  state.busy = true;
  state.error = null;
  render();
  try {
    const result = await host.startSession({
      providerId: 'obsidian',
      id: task.path,
      title: taskTitle(task),
      url: await noteUrl(task.path),
      text: buildBrief(task),
      ...(state.ocProjectId ? { projectId: state.ocProjectId } : {}),
      navigation: 'open',
    });
    if (!result?.sessionId) {
      throw new Error(result?.failure ? `创建会话失败：${result.failure}` : '会话未创建');
    }
    await rest('frontmatter', { notePath: task.path, key: 'status', value: 'running' });
    await rest('frontmatter', { notePath: task.path, key: 'session_id', value: result.sessionId });
    await rest('frontmatter', { notePath: task.path, key: 'updated_at', value: stamp() });
    await rest('append', {
      notePath: task.path,
      heading: 'Agent Execution Log',
      content: `- [${stamp()}] 已派发到会话 ${result.sessionId}（Brain 侧栏）`,
    });
    state.activity = `已派发到会话 ${result.sessionId}`;
    try {
      await host.toast({ kind: 'success', message: `已派发到会话 ${result.sessionId}` });
    } catch {}
    await loadTasks();
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    render();
  }
};

const compose = async (task) => {
  if (state.busy || !task) return;
  try {
    await host.prompt({ text: buildBrief(task), send: false });
    state.activity = '任务简报已写入当前输入框';
    render();
  } catch (error) {
    state.error = messageOf(error);
    render();
  }
};

const openNote = async (notePath) => {
  try {
    await rest('open', { notePath, newLeaf: true });
    state.activity = '已在 Obsidian 中打开';
    render();
  } catch (error) {
    state.error = messageOf(error);
    render();
  }
};

const selectProject = (value) => {
  if (state.busy) return;
  if (value === '__new__') {
    showCreate();
    renderProjects();
    return;
  }
  state.followHost = false;
  if (value.startsWith('oc:')) {
    const project = state.ocProjects.find((item) => item.id === value.slice(3));
    if (!project) return;
    state.ocProjectId = project.id;
    state.ocProjectName = project.name;
    state.projectName = project.name;
    state.projectDirectory = project.directory;
  } else if (value.startsWith('vault:')) {
    state.ocProjectId = '';
    state.ocProjectName = '';
    state.projectName = value.slice(6);
    state.projectDirectory = '';
  } else {
    state.ocProjectId = '';
    state.ocProjectName = '';
    state.projectName = '';
    state.projectDirectory = '';
  }
  state.selectedPath = '';
  state.notice = '';
  void saveSettings();
  void refresh();
};

const inputStyle = 'flex:1;min-width:0;padding:3px 6px;border:1px solid var(--oc-border, rgba(127,127,127,.35));border-radius:4px;background:var(--oc-elevated, transparent);color:inherit;font:inherit;';

const createRow = el('div', 'create-row');
createRow.style.cssText = 'display:none;flex-direction:column;gap:4px;padding:4px 8px;';
const createNameRow = el('div');
createNameRow.style.cssText = 'display:flex;gap:4px;align-items:center;';
const createInput = el('input');
createInput.type = 'text';
createInput.placeholder = '新项目名称';
createInput.style.cssText = inputStyle;
const createOk = el('button', 'btn primary', '创建');
createOk.type = 'button';
const createCancel = el('button', 'btn', '取消');
createCancel.type = 'button';
createNameRow.append(createInput, createOk, createCancel);
const createDirInput = el('input');
createDirInput.type = 'text';
createDirInput.placeholder = '项目目录（留空用知识库文件夹）';
createDirInput.style.cssText = inputStyle;
createRow.append(createNameRow, createDirInput);
if (nodes.project.parentElement) nodes.project.parentElement.insertAdjacentElement('afterend', createRow);

const notice = el('div', 'notice-line');
notice.style.cssText = 'padding:2px 8px 4px;font-size:11px;line-height:1.45;opacity:.72;';
notice.hidden = true;
if (createRow.parentElement) createRow.insertAdjacentElement('afterend', notice);
else root.append(notice);

const hideCreate = () => {
  createRow.style.display = 'none';
};

const showCreate = () => {
  createRow.style.display = 'flex';
  createInput.value = '';
  createDirInput.value = '';
  try {
    createInput.focus({ preventScroll: true });
  } catch {}
};

const joinPath = (...parts) => parts
  .map((part) => String(part || '').trim())
  .filter(Boolean)
  .map((part, index) => (index === 0
    ? part.replace(/[\\/]+$/, '')
    : part.replace(/^[\\/]+|[\\/]+$/g, '').replace(/[\\/]+/g, '\\')))
  .join('\\');

const createProject = async () => {
  const name = createInput.value.trim();
  if (!name || state.busy) return;
  const directory = (createDirInput.value.trim() || joinPath(state.vaultPath, state.baseFolder, name))
    .replace(/\//g, '\\');
  state.busy = true;
  state.error = null;
  render();
  try {
    await rest('project/init', { baseFolder: state.baseFolder, project: name, projectPath: directory });
    if (!state.vaultProjects.includes(name)) state.vaultProjects.push(name);
    let registered = null;
    try {
      registered = await rest('project/register', { directory, label: name });
    } catch (error) {
      state.error = `项目已创建，但同步到 OpenChamber 失败：${messageOf(error)}`;
    }
    const project = registered?.project || null;
    if (project?.id) {
      state.freshOcProject = { id: project.id, name: project.label || name, directory: project.path || directory };
      if (!state.ocProjects.some((item) => item.id === project.id)) state.ocProjects.push(state.freshOcProject);
    }
    state.followHost = false;
    state.ocProjectId = project?.id || '';
    state.ocProjectName = project?.label || name;
    state.projectName = name;
    state.freshProject = name;
    state.projectDirectory = directory;
    state.selectedPath = '';
    state.taskCreate = false;
    state.notice = project
      ? '已写入 OpenChamber 项目列表：按 Ctrl+R 刷新后出现在左侧，并保持当前选中。'
      : '';
    await saveSettings();
    hideCreate();
    state.activity = project ? `已创建 ${name}，已加入 OpenChamber 项目` : `已创建 ${name}`;
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    render();
  }
  await refresh();
};

createOk.addEventListener('click', () => void createProject());
createCancel.addEventListener('click', hideCreate);
createInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void createProject();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hideCreate();
  }
});

nodes.project.addEventListener('change', () => selectProject(nodes.project.value));

nodes.list.addEventListener('click', (event) => {
  const row = event.target.closest('.row');
  if (!row?.dataset.path) return;
  state.selectedPath = row.dataset.path === state.selectedPath ? '' : row.dataset.path;
  render();
});

nodes.refresh.addEventListener('click', () => void refresh());

let readyTimer = 0;
let readyTries = 0;
const nudgeHost = () => {
  if (state.ready || !window.parent || window.parent === window) return;
  if (readyTries >= 60) {
    if (readyTimer) {
      window.clearInterval(readyTimer);
      readyTimer = 0;
    }
    return;
  }
  readyTries += 1;
  try {
    window.parent.postMessage({ channel: 'openchamber.sdk', v: 1, type: 'hello' }, '*');
  } catch {}
};
nudgeHost();
readyTimer = window.setInterval(() => {
  if (state.ready) {
    window.clearInterval(readyTimer);
    readyTimer = 0;
    return;
  }
  nudgeHost();
}, 600);

host.onReady((context) => {
  state.directory = context?.directory || null;
  state.ready = true;
  if (readyTimer) {
    window.clearInterval(readyTimer);
    readyTimer = 0;
  }
  try {
    applyHostReady(context, document.documentElement);
  } catch {}
  render();
  void refresh();
});

host.onDirectory((directory) => {
  state.directory = directory || null;
  if (state.followHost && state.ready) void refresh();
});

window.addEventListener('focus', () => { void refresh(); });
window.setInterval(() => {
  if (document.visibilityState === 'visible') void refresh();
}, 10_000);

render();
void loadSettings().then(() => refresh());
void refresh();
};
