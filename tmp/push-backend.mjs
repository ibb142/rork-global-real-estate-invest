#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'ibb142/rork-global-real-estate-invest';
const BRANCH = 'main';
const ROOT = '/home/user/rork-app';
const API = 'https://api.github.com';

// Only push these directories/files that affect Render backend build
const INCLUDE_DIRS = ['backend'];
const INCLUDE_FILES = ['server.ts', 'package.json', 'tsconfig.json', 'Dockerfile', '.dockerignore', 'render.yaml', 'ivx.json'];

const IGNORE_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build']);

function getAllFiles(dir, base) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...getAllFiles(full, base));
    else if (st.size <= 5*1024*1024) out.push({ path: relative(base, full), full, size: st.size });
  }
  return out;
}

function blobSha(buf) {
  const h = `blob ${buf.length}\0`;
  return createHash('sha1').update(Buffer.concat([Buffer.from(h), buf])).digest('hex');
}

async function gh(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers||{}) } });
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${t.slice(0,400)}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

async function main() {
  // 1. collect local files
  const files = [];
  for (const d of INCLUDE_DIRS) {
    files.push(...getAllFiles(join(ROOT, d), ROOT));
  }
  for (const f of INCLUDE_FILES) {
    try {
      const st = statSync(join(ROOT, f));
      if (st.isFile()) files.push({ path: f, full: join(ROOT, f), size: st.size });
    } catch {}
  }
  console.log(`local files: ${files.length}`);

  // 2. head + remote tree
  const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  console.log(`HEAD: ${headSha.slice(0,7)}`);
  const commit = await gh(`/repos/${REPO}/git/commits/${headSha}`);
  const tree = await gh(`/repos/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  const remote = new Map();
  for (const it of tree.tree || []) if (it.type === 'blob') remote.set(it.path, it.sha);
  console.log(`remote files: ${remote.size}`);

  // 3. diff
  const toUpload = [];
  for (const f of files) {
    const buf = readFileSync(f.full);
    const sha = blobSha(buf);
    if (remote.get(f.path) !== sha) toUpload.push({ ...f, buf });
  }
  console.log(`changed: ${toUpload.length}`);
  if (toUpload.length === 0) { console.log('nothing to push'); return; }

  // 4. blobs (sequential to avoid rate)
  const treeItems = [];
  for (const f of toUpload) {
    const r = await gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.buf.toString('base64'), encoding: 'base64' }) });
    treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: r.sha });
    console.log(`  + ${f.path}`);
    await new Promise(r => setTimeout(r, 150));
  }

  // 5. tree + commit + ref
  const nt = await gh(`/repos/${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeItems }) });
  const nc = await gh(`/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'IVX V7: owner-access-repair backend (V7 status route + client-password repair)', tree: nt.sha, parents: [headSha] }) });
  await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: nc.sha, force: false }) });
  console.log(`\npushed commit: ${nc.sha}`);
  console.log(`https://github.com/${REPO}/commit/${nc.sha}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
