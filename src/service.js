import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  createRestClient,
  outlineMarkdown,
  restErrorMessage,
  restErrorStatus,
  sectionMarkdown,
} from './rest.js';
import {
  SURFACE_AGENT_ACTIVE_HEADER,
  SURFACE_CLIPBOARD_PATH,
  SURFACE_CONTROL_PATH,
  SURFACE_FRAME_PATH,
  SURFACE_FRAME_WAIT_MS,
  SURFACE_HEIGHT_HEADER,
  SURFACE_INPUT_PATH,
  SURFACE_RESIZE_PATH,
  SURFACE_SEQ_HEADER,
  SURFACE_TITLE_HEADER,
  SURFACE_TITLE_MAX,
  SURFACE_WIDTH_HEADER,
  readSurfaceControlNotice,
  readSurfaceInputBatch,
  readSurfaceResizeRequest,
} from '@openchamber/sdk';

const BODY_MAX_BYTES = 2 * 1024 * 1024;

const json = (response, status, body) => {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': bytes.length,
  });
  response.end(bytes);
};

const text = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
};

const authorized = (request, token) => {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

const readBody = async (request) => {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > BODY_MAX_BYTES) throw new Error('Request body too large');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > BODY_MAX_BYTES) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length).toString('utf8');
};

const readObjectBody = async (request) => {
  try {
    const parsed = JSON.parse(await readBody(request));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const queryInteger = (url, name, fallback, maximum) => {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= maximum ? value : null;
};

const errorMessage = (error) => {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Obsidian operation cancelled';
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Unknown Obsidian error';
};

const surfaceTitleHeader = (value) => Array.from(String(value ?? ''), (character) => {
  const codePoint = character.codePointAt(0);
  if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return ' ';
  if (codePoint > 255) return '?';
  return character;
}).join('').trim().slice(0, SURFACE_TITLE_MAX);

const actionStatus = (error) => {
  const message = errorMessage(error);
  if (/without a debug port/i.test(message)) return 409;
  if (/no window to mirror|window is closed|runtime is closed/i.test(message)) return 409;
  return 500;
};

const restAction = async (response, action) => {
  try {
    return json(response, 200, await action());
  } catch (error) {
    return json(response, restErrorStatus(error), { ok: false, error: restErrorMessage(error) });
  }
};

const stringField = (body, name, maxLength = 2048) => {
  const value = typeof body?.[name] === 'string' ? body[name].trim() : '';
  return value.length > 0 && value.length <= maxLength ? value : '';
};

const localStamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const yamlString = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`;

const openChamberSettingsFile = () => path.join(
  process.env.OPENCHAMBER_DATA_DIR ? path.resolve(process.env.OPENCHAMBER_DATA_DIR) : path.join(os.homedir(), '.config', 'openchamber'),
  'settings.json',
);

const openChamberOrigin = () => {
  try {
    const settings = JSON.parse(fs.readFileSync(openChamberSettingsFile(), 'utf8'));
    const port = Number(settings?.desktopLocalPort);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) return `http://127.0.0.1:${port}`;
  } catch {}
  return '';
};

const projectIdForDirectory = (directory) => `path_${Buffer.from(String(directory || '').replace(/\\/g, '/'), 'utf8').toString('base64url')}`;

const projectPathKey = (value) => String(value || '').replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();

const registerOpenChamberProject = async ({ directory, label }) => {
  const origin = openChamberOrigin();
  if (!origin) throw new Error('OpenChamber 端口未知，请确认主程序正在运行');
  fs.mkdirSync(directory, { recursive: true });
  let resolved = path.resolve(directory);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch {}
  const read = await fetch(`${origin}/api/config/settings`, { headers: { accept: 'application/json' } });
  if (!read.ok) throw new Error(`读取 OpenChamber 设置失败（HTTP ${read.status}）`);
  const settings = await read.json();
  const projects = Array.isArray(settings?.projects) ? settings.projects.slice() : [];
  const wantedId = projectIdForDirectory(resolved);
  const existing = projects.find((entry) => (
    projectPathKey(entry?.path) === projectPathKey(resolved)
    || projectPathKey(entry?.id) === projectPathKey(wantedId)
  ));
  const now = Date.now();
  const project = existing
    ? { ...existing, label: label || existing.label, path: resolved, lastOpenedAt: now }
    : {
      id: wantedId,
      path: resolved,
      label: label || path.basename(resolved),
      color: '#30a46c',
      addedAt: now,
      lastOpenedAt: now,
      labelSource: 'auto',
      sidebarCollapsed: false,
    };
  if (existing) projects[projects.indexOf(existing)] = project;
  else projects.push(project);
  const activeProjectId = typeof settings?.activeProjectId === 'string' && settings.activeProjectId
    ? settings.activeProjectId
    : project.id;
  const write = await fetch(`${origin}/api/config/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projects, activeProjectId }),
  });
  if (!write.ok) throw new Error(`写入 OpenChamber 设置失败（HTTP ${write.status}）`);
  const saved = await write.json().catch(() => null);
  const savedProject = Array.isArray(saved?.projects)
    ? saved.projects.find((entry) => (
      entry?.id === project.id || projectPathKey(entry?.path) === projectPathKey(project.path)
    )) || project
    : project;
  return { ok: true, project: savedProject, origin };
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const slugTitle = (title) => String(title ?? '')
  .replace(/[\\/:*?"<>|#^[\]]/g, '')
  .replace(/\s+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'task';

const safeFolderPath = (value) => String(value ?? '')
  .replace(/\\/g, '/')
  .split('/')
  .map((part) => part.trim())
  .filter((part) => part && part !== '.' && part !== '..')
  .join('/');

const fetchOpenChamberJson = async (pathname) => {
  const origin = openChamberOrigin();
  if (!origin) throw new Error('OpenChamber 端口未知，请确认主程序正在运行');
  const response = await fetch(`${origin}${pathname}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenChamber 接口返回 ${response.status}：${pathname}`);
  return response.json();
};

const readOpenChamberSession = async (sessionId) => {
  const result = await fetchOpenChamberJson(`/api/session/${encodeURIComponent(sessionId)}`);
  return result?.data ?? result ?? null;
};

const readOpenChamberMessages = async (sessionId) => {
  const messages = [];
  let cursor = '';
  for (let page = 0; page < 40; page += 1) {
    const query = new URLSearchParams({ limit: '200' });
    if (cursor) query.set('cursor', cursor);
    else query.set('order', 'asc');
    const result = await fetchOpenChamberJson(`/api/session/${encodeURIComponent(sessionId)}/message?${query.toString()}`);
    const batch = Array.isArray(result?.data) ? result.data : [];
    messages.push(...batch);
    const next = typeof result?.cursor?.next === 'string' ? result.cursor.next : '';
    if (!next || batch.length === 0) break;
    cursor = next;
  }
  return messages;
};

const archiveTimeLabel = (value) => {
  const millis = Number(value);
  if (!Number.isFinite(millis) || millis <= 0) return '';
  const date = new Date(millis);
  const pad = (part) => String(part).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${month} ${date.getDate()}, ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const messageText = (message) => {
  const parts = Array.isArray(message?.content) ? message.content : [];
  const text = parts
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');
  if (text) return text;
  return typeof message?.text === 'string' ? message.text.trim() : '';
};

const toolSummaryLine = (part) => {
  const state = part?.state && typeof part.state === 'object' ? part.state : {};
  const input = state.input && typeof state.input === 'object' ? state.input : {};
  const detail = [input.command, input.description, input.filePath, input.path, input.pattern, input.url, state.title]
    .find((value) => typeof value === 'string' && value.trim());
  const status = typeof state.status === 'string' ? state.status : '';
  const label = [part?.name || 'tool', status].filter(Boolean).join(' · ');
  const text = detail ? String(detail).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return text ? `- \`${label}\` ${text}` : `- \`${label}\``;
};

const sessionTitleOf = (session) => String(session?.title || '未命名会话').trim() || '未命名会话';

const buildSessionTurns = (messages) => {
  let messageCount = 0;
  const turns = [];
  let current = null;

  const startTurn = (message) => {
    current = {
      userText: '',
      userTime: Number(message?.time?.created) || 0,
      assistantTexts: [],
      assistantTime: 0,
      model: '',
      variant: '',
      tools: [],
    };
    turns.push(current);
  };

  for (const message of messages) {
    if (message?.type === 'user') {
      const text = messageText(message);
      if (!text) continue;
      messageCount += 1;
      if (!current || current.assistantTexts.length > 0 || current.tools.length > 0) startTurn(message);
      else if (!current.userTime) current.userTime = Number(message?.time?.created) || 0;
      current.userText = [current.userText, text].filter(Boolean).join('\n\n');
      continue;
    }
    if (message?.type !== 'assistant') continue;
    const text = messageText(message);
    const tools = Array.isArray(message.content)
      ? message.content.filter((part) => part?.type === 'tool')
      : [];
    if (!text && tools.length === 0) continue;
    messageCount += 1;
    if (!current) startTurn(null);
    if (!current.assistantTime) {
      current.assistantTime = Number(message?.time?.created || message?.time?.completed) || 0;
      const model = message?.model && typeof message.model === 'object'
        ? [message.model.providerID, message.model.id].filter(Boolean).join('/')
        : '';
      current.model = model;
      current.variant = message?.model?.variant || '';
    }
    if (text) current.assistantTexts.push(text);
    current.tools.push(...tools);
  }

  return { turns, messageCount };
};

const turnMarkdownBlocks = (turns, { includeTools = true } = {}) => turns.map((turn) => {
  const lines = [];
  if (turn.userText) {
    lines.push('**User**');
    const when = archiveTimeLabel(turn.userTime);
    if (when) lines.push('', `*${when}*`);
    lines.push('', turn.userText);
  }
  const assistantText = turn.assistantTexts.join('\n\n');
  if (assistantText || (includeTools && turn.tools.length > 0)) {
    if (lines.length > 0) lines.push('');
    lines.push('**Assistant**');
    const when = archiveTimeLabel(turn.assistantTime);
    const variant = turn.variant ? `, thinking: ${turn.variant}` : '';
    const meta = [when, turn.model ? `(${turn.model}${variant})` : ''].filter(Boolean).join(' ');
    if (meta) lines.push('', `*${meta}*`);
    if (assistantText) lines.push('', assistantText);
    if (includeTools && turn.tools.length > 0) {
      lines.push(
        '',
        '<details>',
        `<summary>工具调用 ${turn.tools.length} 条</summary>`,
        '',
        ...turn.tools.map(toolSummaryLine),
        '',
        '</details>',
      );
    }
  }
  return lines.join('\n');
}).filter(Boolean);

const renderSessionArchive = (session, messages, { notePath, project } = {}) => {
  const title = sessionTitleOf(session);
  const stamp = localStamp();
  const day = stamp.slice(0, 10);
  const updated = Number(session?.time?.updated) || 0;
  const { turns, messageCount } = buildSessionTurns(messages);
  const blocks = turnMarkdownBlocks(turns);

  const frontmatter = [
    '---',
    'type: SessionArchive',
    `session_id: ${yamlString(session?.id || '')}`,
    `session_title: ${yamlString(title)}`,
    `project: ${yamlString(project || '')}`,
    'source: openchamber',
    `archived_at: ${yamlString(stamp)}`,
    `session_updated: ${updated}`,
    `message_count: ${messageCount}`,
    `turn_count: ${turns.length}`,
    ...(notePath ? [`task_path: ${yamlString(notePath)}`] : []),
    '---',
  ].join('\n');

  const body = [
    frontmatter,
    '',
    `# ${title}`,
    '',
    `*Exported on ${day}*`,
    '',
    '---',
    '',
    blocks.length > 0 ? blocks.join('\n\n---\n\n') : '_这个会话还没有可导出的消息。_',
    '',
  ].join('\n');

  return { content: body, messageCount, updated, day };
};

const renderSessionMarkdown = (session, turns, { includeTools = true } = {}) => {
  const title = sessionTitleOf(session);
  const day = localStamp().slice(0, 10);
  const blocks = turnMarkdownBlocks(turns, { includeTools });
  return [
    `# ${title}`,
    '',
    `*Exported on ${day}*`,
    '',
    '---',
    '',
    blocks.length > 0 ? blocks.join('\n\n---\n\n') : '_这个会话还没有可导出的消息。_',
    '',
  ].join('\n');
};

const renderSessionPlain = (session, turns, { includeTools = false } = {}) => {
  const title = sessionTitleOf(session);
  const day = localStamp().slice(0, 10);
  const lines = [title, `Exported on ${day}`, ''];
  for (const turn of turns) {
    if (turn.userText) {
      const when = archiveTimeLabel(turn.userTime);
      lines.push(when ? `User (${when})` : 'User', '', turn.userText, '');
    }
    const assistantText = turn.assistantTexts.join('\n\n');
    if (assistantText) {
      const when = archiveTimeLabel(turn.assistantTime);
      const meta = [when, turn.model].filter(Boolean).join(' · ');
      lines.push(meta ? `Assistant (${meta})` : 'Assistant', '', assistantText, '');
    }
    if (includeTools && turn.tools.length > 0) {
      lines.push(...turn.tools.map((part) => toolSummaryLine(part).replace(/`/g, '')), '');
    }
    lines.push('---', '');
  }
  return `${lines.join('\n').trim()}\n`;
};

const lastAnswerOf = (turns) => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const text = turns[index].assistantTexts.join('\n\n').trim();
    if (text) return text;
  }
  return '';
};

const lastTurnOf = (turns) => {
  const turn = turns[turns.length - 1];
  if (!turn) return '';
  const lines = [];
  if (turn.userText) lines.push('**User**', '', turn.userText, '');
  const text = turn.assistantTexts.join('\n\n').trim();
  if (text) lines.push('**Assistant**', '', text);
  return lines.join('\n').trim();
};

const findSessionArchive = async (rest, folder, sessionId) => {
  let files = [];
  try {
    files = await rest.listMarkdown(folder, false);
  } catch (error) {
    if (error?.status !== 404) throw error;
    return '';
  }
  for (let index = 0; index < files.length; index += 8) {
    const batch = files.slice(index, index + 8);
    const found = await Promise.all(batch.map(async (file) => {
      try {
        const note = await rest.getNote(file.path);
        return note?.frontmatter?.session_id === sessionId ? file.path : '';
      } catch {
        return '';
      }
    }));
    const hit = found.find(Boolean);
    if (hit) return hit;
  }
  return '';
};

export const createService = ({ runtime, token, port = 0 }) => {
  if (!runtime?.surfaceFrame || !runtime?.close) throw new Error('createService requires an Obsidian runtime');
  if (typeof token !== 'string' || token.length === 0) throw new Error('createService requires a bearer token');
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Service port must be from 0 to 65535');
  const activeRequests = new Set();
  let listening = false;
  let closePromise = null;

  const handle = async (request, response, signal) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method === 'GET' && url.pathname === '/obsidian/open') {
      const notePath = url.searchParams.get('path') || '';
      if (!notePath) return text(response, 400, 'path is required\n');
      const vault = url.searchParams.get('vault') || '';
      const target = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(notePath)}`;
      const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>在 Obsidian 打开</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 14px system-ui, sans-serif; background: #101014; color: #e6e6e6; }
a { color: #6aa9ff; }
</style>
</head>
<body>
<div>
<p>正在唤起 Obsidian…</p>
<p>没有自动打开？<a href="${escapeHtml(target)}">点这里</a></p>
</div>
<script>window.setTimeout(() => { window.location.href = ${JSON.stringify(target)}; }, 60);</script>
</body>
</html>`;
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(page);
      return;
    }

    if (!authorized(request, token)) return text(response, 401, 'Unauthorized\n');

    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true });

    if (request.method === 'GET' && url.pathname === '/obsidian/status') {
      return json(response, 200, await runtime.status());
    }

    if (request.method === 'GET' && url.pathname === '/obsidian/targets') {
      return json(response, 200, { targets: await runtime.targets() });
    }

    if (request.method === 'POST' && url.pathname === '/obsidian/select') {
      const body = await readObjectBody(request);
      const targetId = typeof body?.targetId === 'string' && body.targetId.length > 0 && body.targetId.length <= 128
        ? body.targetId : null;
      if (!targetId) return text(response, 400, 'targetId is required\n');
      try {
        return json(response, 200, await runtime.selectTarget(targetId));
      } catch (error) {
        return json(response, actionStatus(error), { ok: false, error: errorMessage(error) });
      }
    }

    if (url.pathname === '/obsidian/pick') {
      if (request.method === 'GET') return json(response, 200, runtime.pick());
      if (request.method === 'POST') {
        try {
          return json(response, 200, runtime.pickFolder());
        } catch (error) {
          return json(response, actionStatus(error), { ok: false, error: errorMessage(error) });
        }
      }
    }

    if (request.method === 'POST' && url.pathname === '/obsidian/open') {
      const body = await readObjectBody(request);
      const vaultPath = typeof body?.path === 'string' ? body.path.trim().slice(0, 1024) : '';
      if (!vaultPath) return text(response, 400, 'path is required\n');
      try {
        return json(response, 200, await runtime.openVault(vaultPath));
      } catch (error) {
        return json(response, actionStatus(error), { ok: false, error: errorMessage(error) });
      }
    }

    const action = request.method === 'POST'
      ? /^\/obsidian\/(launch|restart|show|minimize)$/.exec(url.pathname)?.[1]
      : null;
    if (action) {
      try {
        return json(response, 200, await runtime[action]());
      } catch (error) {
        return json(response, actionStatus(error), { ok: false, error: errorMessage(error) });
      }
    }

    if (request.method === 'GET' && url.pathname === SURFACE_FRAME_PATH) {
      const after = queryInteger(url, 'after', 0, Number.MAX_SAFE_INTEGER);
      const wait = queryInteger(url, 'wait', 0, SURFACE_FRAME_WAIT_MS);
      if (after === null || wait === null) return text(response, 400, 'Invalid frame query\n');
      try {
        const frame = await runtime.surfaceFrame({ after, wait, signal });
        if (!frame) {
          response.writeHead(204);
          return response.end();
        }
        const headers = {
          'content-type': frame.mime,
          'content-length': frame.bytes.length,
          [SURFACE_SEQ_HEADER]: String(frame.sequence),
          [SURFACE_WIDTH_HEADER]: String(frame.width),
          [SURFACE_HEIGHT_HEADER]: String(frame.height),
        };
        const title = surfaceTitleHeader(frame.title);
        if (title) headers[SURFACE_TITLE_HEADER] = title;
        if (runtime.agentActive) headers[SURFACE_AGENT_ACTIVE_HEADER] = '1';
        response.writeHead(200, headers);
        return response.end(frame.bytes);
      } catch (error) {
        return json(response, 503, { ok: false, error: errorMessage(error) });
      }
    }

    if (request.method === 'POST' && url.pathname === SURFACE_INPUT_PATH) {
      const parsed = readSurfaceInputBatch(await readBody(request));
      if (!parsed) return text(response, 400, 'Invalid surface input batch\n');
      try {
        await runtime.surfaceInput(parsed.events, null);
      } catch (error) {
        return json(response, 409, { ok: false, error: errorMessage(error) });
      }
      response.writeHead(204);
      return response.end();
    }

    if (request.method === 'POST' && url.pathname === SURFACE_CONTROL_PATH) {
      const parsed = readSurfaceControlNotice(await readBody(request));
      if (!parsed) return text(response, 400, 'Invalid surface control notice\n');
      await runtime.surfaceControl(parsed.controller, parsed.viewer ?? null);
      response.writeHead(204);
      return response.end();
    }

    if (request.method === 'POST' && url.pathname === SURFACE_RESIZE_PATH) {
      const parsed = readSurfaceResizeRequest(await readBody(request));
      if (!parsed) return text(response, 400, 'Invalid surface resize request\n');
      return json(response, 200, await runtime.surfaceResize(parsed));
    }

    if (request.method === 'GET' && url.pathname === SURFACE_CLIPBOARD_PATH) {
      const copied = await runtime.surfaceClipboard();
      if (!copied) {
        response.writeHead(204);
        return response.end();
      }
      return json(response, 200, { text: copied });
    }

    if (request.method === 'POST' && url.pathname.startsWith('/obsidian/rest/')) {
      const body = await readObjectBody(request);
      if (url.pathname === '/obsidian/rest/service-info') {
        const address = server.address();
        const boundPort = address && typeof address === 'object' ? address.port : 0;
        return json(response, 200, { ok: true, base: boundPort ? `http://127.0.0.1:${boundPort}` : '' });
      }

      // The rail panel draws the Obsidian picture itself so it can share the
      // panel with the Brain pane. These routes carry the same payloads the
      // host surface protocol uses, but over the guest bridge and as JSON.
      if (url.pathname === '/obsidian/rest/surface-frame') {
        const afterRaw = Number(body?.after);
        const waitRaw = Number(body?.wait);
        const after = Number.isInteger(afterRaw) && afterRaw >= 0 ? Math.min(afterRaw, Number.MAX_SAFE_INTEGER) : 0;
        const wait = Number.isFinite(waitRaw) ? Math.min(Math.max(Math.round(waitRaw), 0), 5_000) : 0;
        try {
          const frame = await runtime.surfaceFrame({ after, wait, signal });
          if (!frame) return json(response, 200, { ok: true, idle: true, seq: after });
          if (frame.bytes.length > 4_000_000) {
            return json(response, 200, { ok: true, idle: true, seq: frame.sequence, oversize: true });
          }
          return json(response, 200, {
            ok: true,
            seq: frame.sequence,
            width: frame.width,
            height: frame.height,
            mime: frame.mime,
            data: frame.bytes.toString('base64'),
          });
        } catch (error) {
          return json(response, 409, { ok: false, error: errorMessage(error) });
        }
      }

      if (url.pathname === '/obsidian/rest/surface-input') {
        const parsed = readSurfaceInputBatch(JSON.stringify({ events: body?.events }));
        if (!parsed) return text(response, 400, 'Invalid surface input batch\n');
        try {
          await runtime.surfaceInput(parsed.events, null);
        } catch (error) {
          return json(response, 409, { ok: false, error: errorMessage(error) });
        }
        return json(response, 200, { ok: true });
      }

      if (url.pathname === '/obsidian/rest/surface-control') {
        const parsed = readSurfaceControlNotice(JSON.stringify({ controller: body?.controller }));
        if (!parsed) return text(response, 400, 'Invalid surface control notice\n');
        await runtime.surfaceControl(parsed.controller, parsed.viewer ?? null);
        return json(response, 200, { ok: true });
      }

      if (url.pathname === '/obsidian/rest/surface-resize') {
        const parsed = readSurfaceResizeRequest(JSON.stringify({ width: body?.width, height: body?.height }));
        if (!parsed) return text(response, 400, 'Invalid surface resize request\n');
        return json(response, 200, { ok: true, size: await runtime.surfaceResize(parsed) });
      }

      if (url.pathname === '/obsidian/rest/surface-clipboard') {
        const copied = await runtime.surfaceClipboard();
        return json(response, 200, { ok: true, text: copied || '' });
      }

      const vaultPath = stringField(body, 'vaultPath', 1024);
      const notePath = stringField(body, 'notePath', 2048);
      const vaultRequired = url.pathname !== '/obsidian/rest/session/export';
      if (!vaultPath && vaultRequired) return text(response, 400, 'vaultPath is required\n');
      const client = () => createRestClient(vaultPath);

      if (url.pathname === '/obsidian/rest/config') {
        return restAction(response, async () => {
          const rest = client();
          const ping = await rest.ping();
          return { ok: true, settings: rest.settings, ping };
        });
      }

      if (url.pathname === '/obsidian/rest/note') {
        if (!notePath) return text(response, 400, 'notePath is required\n');
        return restAction(response, async () => ({ ok: true, note: await client().getNote(notePath) }));
      }

      if (url.pathname === '/obsidian/rest/frontmatter') {
        const key = stringField(body, 'key', 200);
        if (!notePath) return text(response, 400, 'notePath is required\n');
        if (!key) return text(response, 400, 'key is required\n');
        if (!Object.prototype.hasOwnProperty.call(body, 'value')) return text(response, 400, 'value is required\n');
        return restAction(response, async () => client().patchFrontmatter(notePath, key, body.value));
      }

      if (url.pathname === '/obsidian/rest/append') {
        const heading = body?.heading;
        const content = typeof body?.content === 'string' ? body.content : '';
        if (!notePath) return text(response, 400, 'notePath is required\n');
        if (!(typeof heading === 'string' || Array.isArray(heading))) return text(response, 400, 'heading is required\n');
        if (!content) return text(response, 400, 'content is required\n');
        return restAction(response, async () => client().appendHeading(notePath, heading, content));
      }

      if (url.pathname === '/obsidian/rest/open') {
        if (!notePath) return text(response, 400, 'notePath is required\n');
        const newLeaf = body?.newLeaf !== false;
        return restAction(response, async () => client().openNote(notePath, newLeaf));
      }

      if (url.pathname === '/obsidian/rest/search') {
        const logic = body?.logic;
        if (!logic || typeof logic !== 'object' || Array.isArray(logic)) return text(response, 400, 'logic is required\n');
        return restAction(response, async () => ({ ok: true, results: await client().searchJsonLogic(logic) }));
      }

      if (url.pathname === '/obsidian/rest/list') {
        const folder = typeof body?.folder === 'string' ? body.folder.trim() : '';
        const recursive = body?.recursive !== false;
        return restAction(response, async () => ({
          ok: true,
          files: await client().listMarkdown(folder, recursive),
        }));
      }

      if (url.pathname === '/obsidian/rest/outline') {
        if (!notePath) return text(response, 400, 'notePath is required\n');
        return restAction(response, async () => {
          const note = await client().getNote(notePath);
          const headings = outlineMarkdown(note.content).map(({ content, ...heading }) => heading);
          return { ok: true, path: note.path, headings };
        });
      }

      if (url.pathname === '/obsidian/rest/section') {
        if (!notePath) return text(response, 400, 'notePath is required\n');
        const heading = body?.heading;
        if (!(typeof heading === 'string' || Array.isArray(heading))) return text(response, 400, 'heading is required\n');
        return restAction(response, async () => {
          const note = await client().getNote(notePath);
          const section = sectionMarkdown(note.content, heading);
          if (!section) return { ok: false, error: 'That section was not found' };
          return { ok: true, path: note.path, section };
        });
      }

      if (url.pathname === '/obsidian/rest/write') {
        if (!notePath) return text(response, 400, 'notePath is required\n');
        const content = typeof body?.content === 'string' ? body.content : '';
        return restAction(response, async () => client().writeNote(notePath, content));
      }

      if (url.pathname === '/obsidian/rest/projects') {
        const baseFolder = stringField(body, 'baseFolder', 512) || '20-笔记/项目';
        return restAction(response, async () => {
          const directory = path.join(vaultPath, ...baseFolder.split('/'));
          let projects = [];
          try {
            projects = fs.readdirSync(directory, { withFileTypes: true })
              .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
              .map((entry) => entry.name)
              .sort((left, right) => left.localeCompare(right, 'zh'));
          } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
          }
          return { ok: true, baseFolder, projects };
        });
      }

      if (url.pathname === '/obsidian/rest/tasks') {
        const folder = stringField(body, 'folder', 512);
        if (!folder) return text(response, 400, 'folder is required\n');
        const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 200);
        return restAction(response, async () => {
          const rest = client();
          const files = (await rest.listMarkdown(folder, false)).slice(0, limit);
          const tasks = [];
          for (let index = 0; index < files.length; index += 6) {
            const batch = files.slice(index, index + 6);
            const notes = await Promise.all(batch.map(async (file) => {
              try {
                const note = await rest.getNote(file.path);
                return {
                  path: file.path,
                  name: file.name,
                  mtime: file.mtime,
                  size: file.size,
                  frontmatter: note.frontmatter ?? {},
                  tags: Array.isArray(note.tags) ? note.tags : [],
                };
              } catch {
                return null;
              }
            }));
            tasks.push(...notes.filter(Boolean));
          }
          return { ok: true, folder, tasks };
        });
      }

      if (url.pathname === '/obsidian/rest/project/init') {
        const project = stringField(body, 'project', 120);
        if (!project) return text(response, 400, 'project is required\n');
        if (/[\\/]|\.\./.test(project)) return text(response, 400, 'project must be a single folder name\n');
        const baseFolder = stringField(body, 'baseFolder', 512) || '20-笔记/项目';
        const projectPath = typeof body?.projectPath === 'string' ? body.projectPath.trim().slice(0, 1024) : '';
        const folder = `${baseFolder}/${project}`;
        return restAction(response, async () => {
          const rest = client();
          const stamp = localStamp();
          const index = `---\ntype: project\nstatus: active\nproject: ${yamlString(project)}\npath: ${yamlString(projectPath)}\nupdated_at: ${yamlString(stamp)}\n---\n\n# ${project}\n\n## 目标\n\n## 任务\n\n- [[${folder}/任务/README|任务索引]]\n\n## 文档\n`;
          const tasksIndex = `---\ntype: index\nstatus: active\nproject: ${yamlString(project)}\nupdated_at: ${yamlString(stamp)}\n---\n\n# ${project} 任务\n\n任务卡放在本目录，一张卡一个文件。\n`;
          const indexNote = await rest.ensureNote(`${folder}/index.md`, index);
          const tasksNote = await rest.ensureNote(`${folder}/任务/README.md`, tasksIndex);
          return { ok: true, folder, index: indexNote, tasks: tasksNote };
        });
      }

      if (url.pathname === '/obsidian/rest/project/register') {
        const directory = typeof body?.directory === 'string' ? body.directory.trim().slice(0, 1024) : '';
        const label = stringField(body, 'label', 120);
        if (!directory) return text(response, 400, 'directory is required\n');
        return restAction(response, async () => registerOpenChamberProject({ directory, label }));
      }

      if (url.pathname === '/obsidian/rest/task/create') {
        const folder = stringField(body, 'folder', 512);
        const title = stringField(body, 'title', 200);
        if (!folder) return text(response, 400, 'folder is required\n');
        if (!title) return text(response, 400, 'title is required\n');
        const project = stringField(body, 'project', 120);
        const priority = ['P0', 'P1', 'P2', 'P3'].includes(body?.priority) ? body.priority : 'P1';
        const agent = stringField(body, 'assigned_agent', 120) || 'opencode';
        const spec = typeof body?.spec === 'string' ? body.spec.slice(0, 8000) : '';
        const criteria = typeof body?.criteria === 'string' ? body.criteria.slice(0, 4000) : '';
        const sessionId = stringField(body, 'session_id', 200);
        const sessionTitle = stringField(body, 'session_title', 200);
        return restAction(response, async () => {
          const rest = client();
          const slug = slugTitle(title);
          let target = `${folder}/${slug}.md`;
          for (let suffix = 2; suffix < 50; suffix += 1) {
            try {
              await rest.getNote(target);
              target = `${folder}/${slug}-${suffix}.md`;
            } catch (error) {
              if (error?.status === 404) break;
              throw error;
            }
          }
          const stamp = localStamp();
          const taskId = `TASK-${stamp.replace(/[-: ]/g, '').slice(0, 14)}`;
          const criteriaLines = criteria
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => (/^[-*]\s*\[[ xX]\]/.test(line) ? line : `- [ ] ${line.replace(/^[-*]\s*/, '')}`));
          const markdown = `---\ntype: AgentTask\ntask_id: ${yamlString(taskId)}\ntitle: ${yamlString(title)}\nproject: ${yamlString(project)}\nstatus: todo\npriority: ${priority}\nassigned_agent: ${yamlString(agent)}\nrules_profile: []\nsession_id: ${yamlString(sessionId)}\nsession_title: ${yamlString(sessionTitle)}\ncreated_at: ${yamlString(stamp)}\nupdated_at: ${yamlString(stamp)}\n---\n\n# ${title}\n\n## Task Spec\n\n${spec || '_Describe the task._'}\n\n## Acceptance Criteria\n\n${criteriaLines.length ? criteriaLines.join('\n') : '- [ ] _Define the acceptance criteria._'}\n\n## Agent Execution Log\n`;
          const result = await rest.ensureNote(target, markdown);
          return {
            ok: true,
            ...result,
            task: { path: target, title, task_id: taskId, project, status: 'todo', priority, assigned_agent: agent, session_id: sessionId, session_title: sessionTitle },
          };
        });
      }

      if (url.pathname === '/obsidian/rest/session/archive') {
        const sessionId = stringField(body, 'sessionId', 200);
        if (!sessionId) return text(response, 400, 'sessionId is required\n');
        const project = stringField(body, 'project', 120);
        const folder = safeFolderPath(stringField(body, 'folder', 512) || `会话记录/${project || '未归类'}`);
        if (!folder) return text(response, 400, 'folder is required\n');
        const taskPath = stringField(body, 'notePath', 2048);
        const auto = body?.auto === true;
        const force = body?.force === true;
        return restAction(response, async () => {
          const rest = client();
          const session = await readOpenChamberSession(sessionId);
          if (!session) throw new Error('OpenChamber 里找不到这个会话');
          const updated = Number(session?.time?.updated) || 0;
          const idle = Number(session?.time?.idle) || 0;
          if (auto && (!idle || updated > idle)) {
            return { ok: true, skipped: 'busy', sessionId, updated };
          }
          let archivePath = await findSessionArchive(rest, folder, sessionId);
          if (archivePath && !force) {
            const existing = await rest.getNote(archivePath).catch(() => null);
            const saved = Number(existing?.frontmatter?.session_updated) || 0;
            if (saved > 0 && saved >= updated) {
              return { ok: true, skipped: 'unchanged', path: archivePath, sessionId, updated };
            }
          }
          const messages = await readOpenChamberMessages(sessionId);
          const title = String(session?.title || '').trim() || '未命名会话';
          const rendered = renderSessionArchive(session, messages, { notePath: taskPath, project });
          if (auto && rendered.messageCount === 0) {
            return { ok: true, skipped: 'empty', sessionId, updated };
          }
          const day = rendered.day;
          let target = archivePath;
          if (!target) {
            const base = `${folder}/${slugTitle(title)}-${day}.md`;
            target = base;
            for (let suffix = 2; suffix < 50; suffix += 1) {
              const existing = await rest.getNote(target).catch((error) => {
                if (error?.status === 404) return null;
                throw error;
              });
              if (!existing) break;
              if (existing?.frontmatter?.session_id === sessionId) break;
              target = `${folder}/${slugTitle(title)}-${day}-${suffix}.md`;
            }
          }
          await rest.writeNote(target, rendered.content);
          if (taskPath) {
            const stamp = localStamp();
            await rest.patchFrontmatter(taskPath, 'archive_path', target);
            await rest.patchFrontmatter(taskPath, 'archived_at', stamp);
            await rest.patchFrontmatter(taskPath, 'session_updated', rendered.updated);
          }
          return {
            ok: true,
            path: target,
            sessionId,
            title,
            created: !archivePath,
            messageCount: rendered.messageCount,
            bytes: Buffer.byteLength(rendered.content, 'utf8'),
            updated: rendered.updated,
          };
        });
      }

      if (url.pathname === '/obsidian/rest/session/export') {
        const sessionId = stringField(body, 'sessionId', 200);
        if (!sessionId) return text(response, 400, 'sessionId is required\n');
        const mode = ['markdown', 'plain', 'last-answer', 'last-turn', 'link', 'id'].includes(body?.mode)
          ? body.mode
          : 'markdown';
        const includeTools = body?.includeTools !== false;
        return restAction(response, async () => {
          if (mode === 'id') {
            return { ok: true, mode, sessionId, text: sessionId, title: sessionId, bytes: sessionId.length };
          }
          if (mode === 'link') {
            const origin = openChamberOrigin();
            if (!origin) throw new Error('OpenChamber 端口未知，请确认主程序正在运行');
            const link = `${origin}/?session=${encodeURIComponent(sessionId)}`;
            return { ok: true, mode, sessionId, text: link, title: sessionId, bytes: link.length };
          }
          const session = await readOpenChamberSession(sessionId);
          if (!session) throw new Error('OpenChamber 里找不到这个会话');
          const messages = await readOpenChamberMessages(sessionId);
          const { turns, messageCount } = buildSessionTurns(messages);
          const title = sessionTitleOf(session);
          let output = '';
          if (mode === 'markdown') output = renderSessionMarkdown(session, turns, { includeTools });
          else if (mode === 'plain') output = renderSessionPlain(session, turns, { includeTools: body?.includeTools === true });
          else if (mode === 'last-answer') output = lastAnswerOf(turns);
          else if (mode === 'last-turn') output = lastTurnOf(turns);
          if (!output.trim()) throw new Error('这个会话还没有可复制的内容');
          return {
            ok: true,
            mode,
            sessionId,
            title,
            text: output,
            messageCount,
            turnCount: turns.length,
            bytes: Buffer.byteLength(output, 'utf8'),
            updated: Number(session?.time?.updated) || 0,
          };
        });
      }

      return text(response, 404, 'Not found\n');
    }

    return text(response, 404, 'Not found\n');
  };

  const server = http.createServer((request, response) => {
    const controller = new AbortController();
    activeRequests.add(controller);
    request.once('aborted', () => controller.abort(new DOMException('Request aborted', 'AbortError')));
    response.once('close', () => {
      activeRequests.delete(controller);
      if (!response.writableEnded) controller.abort(new DOMException('Client disconnected', 'AbortError'));
    });
    void handle(request, response, controller.signal).catch((error) => {
      activeRequests.delete(controller);
      if (!response.headersSent) json(response, 500, { ok: false, error: errorMessage(error) });
      else response.destroy();
    });
  });

  return {
    async listen() {
      if (listening) return this.address;
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      listening = true;
      return this.address;
    },
    get address() {
      const value = server.address();
      return value && typeof value === 'object' ? { host: '127.0.0.1', port: value.port } : null;
    },
    close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        for (const controller of activeRequests) {
          controller.abort(new DOMException('Service stopped', 'AbortError'));
        }
        await runtime.close();
        if (listening) {
          const closed = new Promise((resolve) => server.close(resolve));
          server.closeAllConnections?.();
          await closed;
        }
        listening = false;
      })();
      return closePromise;
    },
  };
};
