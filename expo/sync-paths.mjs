import { existsSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

function normalizePath(value) {
  return value.split(sep).join('/');
}

function findSyncRoot(startDir) {
  let currentDir = startDir;

  while (true) {
    if (existsSync(join(currentDir, '.git')) || existsSync(join(currentDir, 'rork.json'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

export function getSyncPaths(importMetaUrl) {
  const scriptFile = fileURLToPath(importMetaUrl);
  const scriptDir = dirname(scriptFile);
  const envRoot = process.env.SYNC_ROOT?.trim();
  const syncRoot = envRoot && envRoot.length > 0 ? envRoot : findSyncRoot(scriptDir);
  const appRoot = existsSync(join(syncRoot, 'expo', 'package.json')) ? join(syncRoot, 'expo') : syncRoot;
  const appPrefix = appRoot === syncRoot ? '' : normalizePath(relative(syncRoot, appRoot));

  return {
    scriptFile,
    scriptDir,
    syncRoot,
    appRoot,
    appPrefix,
  };
}

export function toSyncRelativePath(syncRoot, absolutePath) {
  return normalizePath(relative(syncRoot, absolutePath));
}
