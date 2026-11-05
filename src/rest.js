import http from 'node:http';
import https from 'node:https';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const SETTINGS_TTL_MS = 30_000;
const PATCH_ATTEMPTS = 3;

const settingsCache = new Map();
const writeQueues = new Map();

export class RestError extends Error {
  constructor(message, status = 502, detail = '') {
    super(message);
    this.name = 'RestError';
    this.status = status;
    this.detail = detail;
  }
}

const pluginDataFile = (vaultPath) => path.join(
  vaultPath,
  '.obsidian',
  'plugins',
  'obsidian-local-rest-api',
  'data.json',
);

const readJsonFile = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

export const readRestSettings = (vaultPath) => {
  if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
    throw new RestError('vaultPath is required', 400);
  }
  const resolved = path.resolve(vaultPath);
  const cached = settingsCache.get(resolved);
  if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) return cached.settings;

  const data = readJsonFile(pluginDataFile(resolved));
  if (!data) {
    throw new RestError(
      'Local REST API is not configured in this vault. Enable the plugin and copy its API key.',
      503,
    );
  }
  const apiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
  if (!apiKey) throw new RestError('Local REST API has no API key', 503);

  const insecurePort = Number(data.insecurePort);
  const securePort = Number(data.port);
  const insecure = data.enableInsecureServer !== false && Number.isInteger(insecurePort) && insecurePort > 0;
  const secure = data.enableSecureServer !== false && Number.isInteger(securePort) && securePort > 0;
  if (!insecure && !secure) throw new RestError('Local REST API has no enabled HTTP server', 503);

  const settings = {
    vaultPath: resolved,
    baseUrl: insecure ? `http://127.0.0.1:${insecurePort}` : `https://127.0.0.1:${securePort}`,
    apiKey,
    insecure,
    insecurePort: insecure ? insecurePort : null,
    securePort: secure ? securePort : null,
    protocol: insecure ? 'http' : 'https',
  };
  settingsCache.set(resolved, { at: Date.now(), settings });
  return settings;
};

export const clearRestSettingsCache = (vaultPath) => {
  if (vaultPath) settingsCache.delete(path.resolve(vaultPath));
  else settingsCache.clear();
};

const normalizeNotePath = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new RestError('notePath is required', 400);
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
};

const encodePath = (value) => normalizeNotePath(value)
  .split('/')
  .map((segment) => encodeURIComponent(segment))
  .join('/');

const request = (settings, method, pathname, { headers = {}, body, signal } = {}) => new Promise((resolve, reject) => {
  let url;
  try {
    url = new URL(pathname, settings.baseUrl);
  } catch (error) {
    reject(new RestError(error.message, 400));
    return;
  }
  const transport = url.protocol === 'https:' ? https : http;
  const payload = body === undefined ? null : Buffer.from(String(body), 'utf8');
  const requestHeaders = {
    authorization: `Bearer ${settings.apiKey}`,
    accept: 'application/json',
    ...headers,
  };
  if (payload) requestHeaders['content-length'] = String(payload.length);

  const client = transport.request(url, {
    method,
    headers: requestHeaders,
    rejectUnauthorized: false,
    timeout: REQUEST_TIMEOUT_MS,
  }, (response) => {
    const chunks = [];
    let length = 0;
    response.on('data', (chunk) => {
      length += chunk.length;
      if (length <= MAX_RESPONSE_BYTES) chunks.push(chunk);
    });
    response.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: text,
      });
    });
  });
  client.on('timeout', () => client.destroy(new RestError('Obsidian REST request timed out', 504)));
  client.on('error', (error) => reject(error instanceof RestError ? error : new RestError(error.message, 502)));
  if (signal) {
    if (signal.aborted) {
      client.destroy(new RestError('Obsidian REST request cancelled', 499));
      return;
    }
    signal.addEventListener('abort', () => {
      client.destroy(new RestError('Obsidian REST request cancelled', 499));
    }, { once: true });
  }
  if (payload) client.write(payload);
  client.end();
});

const responseError = (response, action) => {
  let message = `Obsidian REST ${action} failed with ${response.status}`;
  let detail = response.body.slice(0, 500);
  try {
    const parsed = JSON.parse(response.body);
    if (typeof parsed?.message === 'string' && parsed.message) message = parsed.message;
    else if (typeof parsed?.error === 'string' && parsed.error) message = parsed.error;
    if (typeof parsed?.errorCode === 'string') detail = `${parsed.errorCode}: ${detail}`;
  } catch {}
  return new RestError(message, response.status === 404 ? 404 : 502, detail);
};

const expectJson = (response, action) => {
  if (response.status < 200 || response.status >= 300) throw responseError(response, action);
  try {
    return JSON.parse(response.body);
  } catch {
    throw new RestError(`Obsidian REST ${action} returned invalid JSON`, 502, response.body.slice(0, 300));
  }
};

const enqueueWrite = (key, task) => {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  writeQueues.set(key, next);
  next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  }).catch(() => {});
  return next;
};

export const createRestClient = (vaultPath) => {
  const settings = readRestSettings(vaultPath);
  const vault = settings.vaultPath;

  const client = {
    get settings() {
      return {
        vaultPath: vault,
        baseUrl: settings.baseUrl,
        protocol: settings.protocol,
        insecurePort: settings.insecurePort,
        securePort: settings.securePort,
      };
    },

    async ping(signal) {
      const response = await request(settings, 'GET', '/', { signal });
      return expectJson(response, 'ping');
    },

    async getNote(notePath, signal) {
      const response = await request(settings, 'GET', `/vault/${encodePath(notePath)}`, {
        headers: { accept: 'application/vnd.olrapi.note+json' },
        signal,
      });
      return expectJson(response, 'get note');
    },

    async getDocumentMap(notePath, signal) {
      const response = await request(settings, 'GET', `/vault/${encodePath(notePath)}`, {
        headers: { accept: 'application/vnd.olrapi.document-map+json' },
        signal,
      });
      return expectJson(response, 'get document map');
    },

    async writeNote(notePath, content, signal) {
      const response = await request(settings, 'PUT', `/vault/${encodePath(notePath)}`, {
        headers: { 'content-type': 'text/markdown' },
        body: content,
        signal,
      });
      if (response.status < 200 || response.status >= 300) throw responseError(response, 'write note');
      return { ok: true, path: normalizeNotePath(notePath) };
    },

    async ensureNote(notePath, content, signal) {
      const normalized = normalizeNotePath(notePath);
      try {
        await client.getNote(normalized, signal);
        return { ok: true, path: normalized, created: false };
      } catch (error) {
        if (!(error instanceof RestError) || error.status !== 404) throw error;
        await client.writeNote(normalized, content, signal);
        return { ok: true, path: normalized, created: true };
      }
    },

    async patchFrontmatter(notePath, key, value, signal) {
      if (typeof key !== 'string' || !key.trim()) throw new RestError('key is required', 400);
      const normalized = normalizeNotePath(notePath);
      return enqueueWrite(`${vault}\u0000${normalized}`, async () => {
        let lastError = null;
        for (let attempt = 0; attempt < PATCH_ATTEMPTS; attempt += 1) {
          const map = await client.getDocumentMap(normalized, signal);
          const response = await request(settings, 'PATCH', `/vault/${encodePath(normalized)}`, {
            headers: {
              'content-type': 'application/json',
              ...(typeof map?.version === 'string' && map.version ? { 'if-match': map.version } : {}),
            },
            body: JSON.stringify({
              operation: 'replace',
              targetType: 'frontmatter',
              target: key,
              value,
              createTargetIfMissing: true,
            }),
            signal,
          });
          if (response.status === 412) {
            lastError = responseError(response, 'patch frontmatter');
            continue;
          }
          if (response.status < 200 || response.status >= 300) throw responseError(response, 'patch frontmatter');
          return { ok: true, path: normalized, key, value, attempts: attempt + 1 };
        }
        throw lastError ?? new RestError('Obsidian REST patch kept conflicting', 409);
      });
    },

    async appendHeading(notePath, heading, content, signal) {
      const normalized = normalizeNotePath(notePath);
      let target;
      if (Array.isArray(heading)) {
        target = heading.map((part) => String(part).trim()).filter(Boolean);
      } else {
        const raw = String(heading ?? '').trim();
        if (raw.includes('::')) {
          target = raw.split('::').map((part) => part.trim()).filter(Boolean);
        } else {
          const note = await client.getNote(normalized, signal).catch(() => null);
          target = note?.content ? resolveHeadingPath(note.content, raw) : (raw ? [raw] : []);
        }
      }
      if (target.length === 0) throw new RestError('heading is required', 400);
      if (typeof content !== 'string' || !content) throw new RestError('content is required', 400);
      return enqueueWrite(`${vault}\u0000${normalized}`, async () => {
        let lastError = null;
        for (let attempt = 0; attempt < PATCH_ATTEMPTS; attempt += 1) {
          const map = await client.getDocumentMap(normalized, signal);
          const response = await request(settings, 'PATCH', `/vault/${encodePath(normalized)}`, {
            headers: {
              'content-type': 'application/json',
              ...(typeof map?.version === 'string' && map.version ? { 'if-match': map.version } : {}),
            },
            body: JSON.stringify({
              operation: 'append',
              targetType: 'heading',
              target,
              content,
              createTargetIfMissing: true,
            }),
            signal,
          });
          if (response.status === 412) {
            lastError = responseError(response, 'append heading');
            continue;
          }
          if (response.status < 200 || response.status >= 300) throw responseError(response, 'append heading');
          return { ok: true, path: normalized, heading: target, attempts: attempt + 1 };
        }
        throw lastError ?? new RestError('Obsidian REST append kept conflicting', 409);
      });
    },

    async openNote(notePath, newLeaf = true, signal) {
      const normalized = normalizeNotePath(notePath);
      const query = newLeaf ? '?newLeaf=true' : '';
      const response = await request(settings, 'POST', `/open/${encodePath(normalized)}${query}`, { signal });
      if (response.status < 200 || response.status >= 300) throw responseError(response, 'open note');
      return { ok: true, path: normalized, newLeaf: Boolean(newLeaf) };
    },

    async searchJsonLogic(logic, signal) {
      const response = await request(settings, 'POST', '/search/', {
        headers: { 'content-type': 'application/vnd.olrapi.jsonlogic+json' },
        body: JSON.stringify(logic),
        signal,
      });
      return expectJson(response, 'search');
    },

    async listMarkdown(folder = '', recursive = true) {
      const root = path.resolve(vault);
      const start = folder ? path.resolve(root, folder) : root;
      if (start !== root && !start.startsWith(root + path.sep)) throw new RestError('folder escapes the vault', 400);
      const files = [];
      const walk = (dir, depth) => {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (recursive && depth < 12) walk(full, depth + 1);
            continue;
          }
          if (!entry.name.toLowerCase().endsWith('.md')) continue;
          let stat = null;
          try {
            stat = statSync(full);
          } catch {}
          files.push({
            path: path.relative(root, full).split(path.sep).join('/'),
            name: entry.name.replace(/\.md$/i, ''),
            size: stat?.size ?? 0,
            mtime: stat?.mtimeMs ?? 0,
          });
        }
      };
      walk(start, 0);
      files.sort((left, right) => right.mtime - left.mtime);
      return files;
    },
  };

  return client;
};

export const outlineMarkdown = (content) => {
  const lines = String(content ?? '').split(/\r?\n/);
  const headings = [];
  let inFence = false;
  let fence = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fence = fenceMatch[1][0];
      } else if (fenceMatch[1][0] === fence) {
        inFence = false;
        fence = '';
      }
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      line: index + 1,
    });
  }
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    const endLine = next ? next.line - 1 : lines.length;
    const body = lines.slice(heading.line, endLine).join('\n').trim();
    return {
      ...heading,
      endLine,
      chars: body.length,
      tokens: Math.ceil(body.length / 4),
      content: body,
    };
  });
};

export const sectionMarkdown = (content, headingPath) => {
  const parts = Array.isArray(headingPath)
    ? headingPath.map((part) => String(part).trim()).filter(Boolean)
    : String(headingPath ?? '').split('::').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const headings = outlineMarkdown(content);
  let parentLevel = 0;
  let parentEnd = Number.MAX_SAFE_INTEGER;
  let found = null;
  for (const part of parts) {
    found = headings.find((heading) => (
      heading.title === part
      && heading.level > parentLevel
      && heading.line <= parentEnd
    )) ?? null;
    if (!found) return null;
    parentLevel = found.level;
    parentEnd = found.endLine;
  }
  return found;
};

// Heading targets are full paths from the document root. A plain title is
// resolved against the note so an H2 named "Log" becomes ["Task", "Log"]
// instead of creating a new H1 at the end of the file.
export const resolveHeadingPath = (content, title) => {
  const wanted = String(title ?? '').trim();
  if (!wanted) return [];
  const headings = outlineMarkdown(content);
  const stack = [];
  for (const heading of headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    stack.push({ level: heading.level, title: heading.title });
    if (heading.title === wanted) return stack.map((entry) => entry.title);
  }
  return [wanted];
};

export const restErrorStatus = (error) => (
  error instanceof RestError ? error.status : 500
);

export const restErrorMessage = (error) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Unknown Obsidian REST error';
};
