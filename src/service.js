import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
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

const slugTitle = (title) => String(title ?? '')
  .replace(/[\\/:*?"<>|#^[\]]/g, '')
  .replace(/\s+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'task';

export const createService = ({ runtime, token, port = 0 }) => {
  if (!runtime?.surfaceFrame || !runtime?.close) throw new Error('createService requires an Obsidian runtime');
  if (typeof token !== 'string' || token.length === 0) throw new Error('createService requires a bearer token');
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Service port must be from 0 to 65535');
  const activeRequests = new Set();
  let listening = false;
  let closePromise = null;

  const handle = async (request, response, signal) => {
    if (!authorized(request, token)) return text(response, 401, 'Unauthorized\n');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

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
      const vaultPath = stringField(body, 'vaultPath', 1024);
      const notePath = stringField(body, 'notePath', 2048);
      if (!vaultPath) return text(response, 400, 'vaultPath is required\n');
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
          const markdown = `---\ntype: AgentTask\ntask_id: ${yamlString(taskId)}\ntitle: ${yamlString(title)}\nproject: ${yamlString(project)}\nstatus: todo\npriority: ${priority}\nassigned_agent: ${yamlString(agent)}\nrules_profile: []\nsession_id: ""\ncreated_at: ${yamlString(stamp)}\nupdated_at: ${yamlString(stamp)}\n---\n\n# ${title}\n\n## Task Spec\n\n${spec || '_Describe the task._'}\n\n## Acceptance Criteria\n\n${criteriaLines.length ? criteriaLines.join('\n') : '- [ ] _Define the acceptance criteria._'}\n\n## Agent Execution Log\n`;
          const result = await rest.ensureNote(target, markdown);
          return {
            ok: true,
            ...result,
            task: { path: target, title, task_id: taskId, project, status: 'todo', priority, assigned_agent: agent },
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
