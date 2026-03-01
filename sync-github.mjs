import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'ibb142/rork-global-real-estate-invest';
const BRANCH = 'main';
const API = 'https://api.github.com';

const IGNORE = new Set([
  'node_modules', '.git', '.expo', 'bun.lock', 'package-lock.json',
  '.rork', 'dist', 'build', '.DS_Store',
]);

const IGNORE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp4', '.mov']);

function getAllFiles(dir, base = dir, files = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    const rel = relative(base, full);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      getAllFiles(full, base, files);
    } else {
      const ext = entry.includes('.') ? '.' + entry.split('.').pop() : '';
      if (!IGNORE_EXTENSIONS.has(ext)) {
        files.push(rel);
      }
    }
  }
  return files;
}

async function githubFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

async function getFileSha(path) {
  const data = await githubFetch(`/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
  return data?.sha ?? null;
}

async function upsertFile(path, content, sha) {
  const body = {
    message: `sync: update ${path}`,
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  return githubFetch(`/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function getRepoTree() {
  const data = await githubFetch(`/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
  if (!data) return new Map();
  const map = new Map();
  for (const item of data.tree || []) {
    if (item.type === 'blob') map.set(item.path, item.sha);
  }
  return map;
}

async function createBranch() {
  const ref = await githubFetch(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  if (ref) return;
  const defaultBranch = await githubFetch(`/repos/${REPO}`);
  const sha = defaultBranch?.default_branch
    ? (await githubFetch(`/repos/${REPO}/git/ref/heads/${defaultBranch.default_branch}`))?.object?.sha
    : null;
  if (!sha) throw new Error('Could not get default branch SHA');
  await githubFetch(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }),
  });
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is not set');
    process.exit(1);
  }

  console.log(`🔄 Syncing to GitHub: ${REPO} (${BRANCH})`);

  await createBranch();

  console.log('📂 Scanning local files...');
  const localFiles = getAllFiles('/home/user/rork-app');
  console.log(`   Found ${localFiles.length} files`);

  console.log('🌐 Fetching remote tree...');
  const remoteTree = await getRepoTree();
  console.log(`   Remote has ${remoteTree.size} files`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of localFiles) {
    try {
      const fullPath = join('/home/user/rork-app', filePath);
      if (!existsSync(fullPath)) continue;

      const content = readFileSync(fullPath);
      const localBase64 = Buffer.from(content).toString('base64');

      const remoteSha = remoteTree.get(filePath) ?? null;

      if (remoteSha) {
        const remoteFile = await githubFetch(`/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`);
        if (remoteFile?.content?.replace(/\n/g, '') === localBase64.replace(/\n/g, '')) {
          skipped++;
          continue;
        }
      }

      process.stdout.write(`   ↑ ${filePath}... `);
      await upsertFile(filePath, content, remoteSha);
      console.log('✅');
      updated++;

      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      errors++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Done! Updated: ${updated} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log(`🔗 https://github.com/${REPO}/tree/${BRANCH}`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
