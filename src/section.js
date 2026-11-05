import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

const host = connectHost();

const nodes = {
  project: document.querySelector('#project'),
  refresh: document.querySelector('#refresh'),
  error: document.querySelector('#error'),
  list: document.querySelector('#list'),
  actions: document.querySelector('#actions'),
  foot: document.querySelector('#foot'),
};

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
  sessions: 0,
  tasks: [],
  selectedPath: '',
  busy: false,
  ready: false,
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

const projectFolder = () => (state.projectName ? `${state.baseFolder}/${state.projectName}` : '');
const taskFolder = () => (projectFolder() ? `${projectFolder()}/任务` : '');

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
  const byId = state.ocProjectId
    ? state.ocProjects.find((project) => project.id === state.ocProjectId)
    : null;
  const byName = !byId && state.projectName
    ? state.ocProjects.find((project) => project.name === state.projectName)
    : null;
  const byDirectory = !byId && !byName && state.directory && state.projectName === ''
    ? state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory))
    : null;
  const selected = byId || byName || byDirectory || null;
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
  } catch {
    state.ocProjects = [];
  }
  resolveProject();
  if (state.projectName && !state.vaultProjects.includes(state.projectName)) state.vaultProjects.push(state.projectName);
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
  if (!state.ocProjectId) {
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
  if (state.busy || !state.ready) return;
  state.busy = true;
  state.error = null;
  render();
  try {
    await loadProjects();
    await checkProject();
    if (!state.bound && state.ocProjectId && state.projectName) {
      await rest('project/init', {
        baseFolder: state.baseFolder,
        project: state.projectName,
        projectPath: state.projectDirectory || '',
      });
      if (!state.vaultProjects.includes(state.projectName)) state.vaultProjects.push(state.projectName);
      await checkProject();
    }
    await loadSessions();
    await loadTasks();
    state.activity = state.projectName
      ? `${state.tasks.length} 个任务${state.sessions ? ` · ${state.sessions} 个会话` : ''}`
      : '选择一个项目';
  } catch (error) {
    state.error = messageOf(error);
  } finally {
    state.busy = false;
    render();
  }
};

const renderProjects = () => {
  const linked = new Set(state.ocProjects.map((project) => project.name));
  const vaultOnly = state.vaultProjects.filter((name) => !linked.has(name));
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
  nodes.project.replaceChildren(...options);
  nodes.project.value = state.ocProjectId ? `oc:${state.ocProjectId}` : state.projectName ? `vault:${state.projectName}` : '';
  nodes.project.disabled = state.busy;
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

const renderList = () => {
  if (!state.projectName) {
    nodes.list.replaceChildren(emptyBlock('还没有可用的项目。请在 OpenChamber 里添加项目，或在完整 Brain 页面新建知识库项目。'));
    return;
  }
  if (!state.bound) {
    nodes.list.replaceChildren(emptyBlock(`${projectFolder()} 还没有初始化。`, '初始化项目', () => void refresh()));
    return;
  }
  if (!state.tasks.length) {
    nodes.list.replaceChildren(emptyBlock('还没有任务。到完整 Brain 页面新建一个任务。'));
    return;
  }
  nodes.list.replaceChildren(...state.tasks.map((task) => {
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

  const composeButton = el('button', 'btn', '写入对话');
  composeButton.type = 'button';
  composeButton.disabled = state.busy;
  composeButton.addEventListener('click', () => void compose(task));

  const openButton = el('button', 'btn', '打开');
  openButton.type = 'button';
  openButton.disabled = state.busy;
  openButton.addEventListener('click', () => void openNote(task.path));

  nodes.actions.replaceChildren(label, statusSelect, dispatchButton, composeButton, openButton);
};

const render = () => {
  nodes.error.hidden = !state.error;
  nodes.error.textContent = state.error || '';
  nodes.refresh.disabled = state.busy;
  nodes.refresh.classList.toggle('spin', state.busy);
  renderProjects();
  renderList();
  renderActions();
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
      url: `obsidian://open?vault=${encodeURIComponent(basename(state.vaultPath))}&file=${encodeURIComponent(task.path)}`,
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
  void saveSettings();
  void refresh();
};

nodes.project.addEventListener('change', () => selectProject(nodes.project.value));

nodes.list.addEventListener('click', (event) => {
  const row = event.target.closest('.row');
  if (!row?.dataset.path || state.busy) return;
  state.selectedPath = row.dataset.path === state.selectedPath ? '' : row.dataset.path;
  render();
});

nodes.refresh.addEventListener('click', () => void refresh());

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  state.directory = context?.directory || null;
  render();
  if (state.ready) {
    void refresh();
    return;
  }
  state.ready = true;
  void loadSettings().then(() => refresh());
});

window.addEventListener('focus', () => { void refresh(); });
window.setInterval(() => {
  if (document.visibilityState === 'visible') void refresh();
}, 10_000);
