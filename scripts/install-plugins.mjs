#!/usr/bin/env node
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const PLUGINS = [
  { repo: 'mProjectsCode/obsidian-meta-bind-plugin', fallbackId: 'obsidian-meta-bind-plugin' },
  { repo: 'mdelobelle/metadatamenu', fallbackId: 'metadata-menu' },
  { repo: 'mgmeyers/obsidian-kanban', fallbackId: 'obsidian-kanban' },
  { repo: 'SkepticMystic/breadcrumbs', fallbackId: 'breadcrumbs' },
  { repo: 'HEmile/juggl', fallbackId: 'juggl' },
  { repo: 'zsviczian/obsidian-excalidraw-plugin', fallbackId: 'obsidian-excalidraw-plugin' },
  { repo: 'chhoumann/quickadd', fallbackId: 'quickadd' },
  { repo: 'danielo515/obsidian-modal-form', fallbackId: 'obsidian-modal-form' },
  { repo: 'ElsaTam/obsidian-extended-graph', fallbackId: 'extended-graph' },
  { repo: 'Vinzent03/obsidian-advanced-uri', fallbackId: 'obsidian-advanced-uri' },
  { repo: 'mgmeyers/obsidian-style-settings', fallbackId: 'obsidian-style-settings' },
  { repo: 'scambier/obsidian-omnisearch', fallbackId: 'obsidian-omnisearch' },
];

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers = {
  'User-Agent': 'openchamber-obsidian-panel-installer',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const retry = async (fn, attempts = 4) => {
  let last;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (index + 1)));
    }
  }
  throw last;
};

const fetchJson = async (url) => retry(async () => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${url}`);
  return response.json();
});

const download = async (url, file) => retry(async () => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(file, bytes);
  return bytes.length;
});

const install = async (vault, plugin) => {
  const release = await fetchJson(`https://api.github.com/repos/${plugin.repo}/releases/latest`);
  const byName = new Map(release.assets.map((asset) => [asset.name, asset]));
  if (!byName.has('manifest.json') || !byName.has('main.js')) {
    throw new Error(`release ${release.tag_name} has no manifest.json/main.js`);
  }

  const tempManifest = path.join(vault, '.obsidian', 'plugins', '.manifest.tmp.json');
  await mkdir(path.dirname(tempManifest), { recursive: true });
  await download(byName.get('manifest.json').browser_download_url, tempManifest);
  const manifest = JSON.parse(await readFile(tempManifest, 'utf8'));
  const id = manifest.id || plugin.fallbackId;
  const dir = path.join(vault, '.obsidian', 'plugins', id);
  await mkdir(dir, { recursive: true });

  const installedManifest = path.join(dir, 'manifest.json');
  const installedMain = path.join(dir, 'main.js');
  if (await exists(installedManifest) && await exists(installedMain)) {
    const current = JSON.parse(await readFile(installedManifest, 'utf8'));
    if (current.version === manifest.version) {
      return { id, version: manifest.version, tag: release.tag_name, mainBytes: 0, styleBytes: 0, skipped: true };
    }
  }

  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const mainBytes = await download(byName.get('main.js').browser_download_url, path.join(dir, 'main.js'));
  let styleBytes = 0;
  if (byName.has('styles.css')) {
    styleBytes = await download(byName.get('styles.css').browser_download_url, path.join(dir, 'styles.css'));
  }

  return { id, version: manifest.version, tag: release.tag_name, mainBytes, styleBytes };
};

const enable = async (vault, ids) => {
  const file = path.join(vault, '.obsidian', 'community-plugins.json');
  let list = [];
  if (await exists(file)) list = JSON.parse(await readFile(file, 'utf8'));
  const merged = [...new Set([...list, ...ids])];
  await writeFile(file, JSON.stringify(merged, null, 2) + '\n');
  return merged;
};

const main = async () => {
  const vaults = process.argv.slice(2);
  if (vaults.length === 0) {
    console.error('usage: node scripts/install-plugins.mjs <vault> [vault...]');
    process.exit(1);
  }

  for (const vault of vaults) {
    const installed = [];
    for (const plugin of PLUGINS) {
      try {
        const result = await install(vault, plugin);
        installed.push(result);
        console.log(`${vault}\t${result.id}\t${result.version}\t${result.mainBytes}B`);
      } catch (error) {
        console.error(`${vault}\t${plugin.repo}\tFAILED\t${error.message}`);
      }
    }
    const enabled = await enable(vault, installed.map((item) => item.id));
    console.log(`${vault}\tenabled=${enabled.length}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
