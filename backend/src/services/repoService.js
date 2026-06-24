// Repository workspace and git boundary.
//
// Beginner reading guide: this service imports/clones a repo into an isolated
// project workspace, creates a working branch, captures commit/diff evidence,
// and enforces path/secret safety. It never executes scripts from uploaded repos.
//
// Clone a repo into an isolated per-project workspace, cut a working branch,
// commit + diff agent changes, enforce repo safety (no secret reads, no script
// execution), and clean the workspace up when a workflow ends.
//
// Git operations use execFile with an argument array, avoiding shell expansion.

const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const WORKSPACE_DIR = path.join(__dirname, '../../../workspace/projects');

// Files an agent must never read (secrets) — flagged by assertRepoSafe.
const SECRET_PATTERNS = [
  /(^|[\\/])\.env(\..*)?$/i,
  /\.pem$/i,
  /(^|[\\/])id_rsa$/i,
  /(^|[\\/])id_dsa$/i,
  /(^|[\\/])id_ecdsa$/i,
  /(^|[\\/])id_ed25519$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.key$/i,
  /(^|[\\/])credentials(\.json)?$/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.git-credentials$/i,
];

/** Run a git command, rejecting with a readable error envelope on failure. */
function git(args, cwd, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 1024 * 1024 * 64, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || '').toString().trim();
        reject(new ApiError(502, `git ${args[0]} failed: ${detail}`, 'REPO_CLONE_FAILED', 'REPO_CLONE'));
        return;
      }
      resolve(stdout.toString());
    });
  });
}

/** lowercase-kebab slug from a free-text request, for the working branch name. */
function slugify(text, fallback = 'feature') {
  const slug = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

function isHttpUrl(url) {
  return /^https?:\/\/[^\s]+$/i.test(String(url || '').trim());
}

/**
 * Canonical upload path when called with just `projectId`; the isolated,
 * per-session working copy when `sessionId` is also given. Sessions never
 * write into the canonical path, so concurrent sessions (and the original
 * upload) can never clobber each other.
 */
function repoPathFor(projectId, sessionId) {
  return sessionId
    ? path.join(WORKSPACE_DIR, projectId, 'sessions', sessionId, 'repo')
    : path.join(WORKSPACE_DIR, projectId, 'repo');
}

/**
 * Copy the canonical uploaded repo into a fresh per-session working copy and
 * cut the session's working branch there. Used when a new session starts
 * against a project that was set up via "upload folder" (no remote/local
 * repoUrl to (re)clone from).
 * @returns {{ repoPath, workingBranch, baseBranch }}
 */
async function prepareSessionRepo({ projectId, sessionId, request = '' }) {
  const canonicalPath = repoPathFor(projectId);
  const sessionPath = repoPathFor(projectId, sessionId);

  let canonicalExists = true;
  try {
    await fs.access(canonicalPath);
  } catch (_) {
    canonicalExists = false;
  }
  if (!canonicalExists) {
    // Auto-initialize an empty directory to support "from scratch" AI generation
    await fs.mkdir(canonicalPath, { recursive: true });
    await fs.writeFile(path.join(canonicalPath, 'README.md'), `# Project ${projectId}\n\nAuto-initialized by AIFA.`);
  }

  await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.cp(canonicalPath, sessionPath, { recursive: true });
  // Drop the canonical repo's own .git history — each session starts its own.
  await fs.rm(path.join(sessionPath, '.git'), { recursive: true, force: true }).catch(() => {});

  await git(['init'], sessionPath);
  await git(['config', 'user.email', 'aifa-bot@local'], sessionPath);
  await git(['config', 'user.name', 'AIFA Bot'], sessionPath);
  await git(['checkout', '-B', 'main'], sessionPath).catch(() => {});
  await git(['add', '-A'], sessionPath);
  await git(['commit', '--allow-empty', '-m', 'aifa: session workspace from uploaded repo'], sessionPath).catch(() => {});

  const workingBranch = `aifa/${slugify(request)}`;
  await git(['checkout', '-B', workingBranch], sessionPath);

  logger.info('session repo prepared from canonical upload', { projectId, sessionId, sessionPath });
  return { repoPath: sessionPath, workingBranch, baseBranch: 'main' };
}

/**
 * T1.1 — clone a repo, checkout `branch`, cut a working branch `aifa/<slug>`.
 * @returns {{ repoPath, workingBranch, baseBranch }}
 */
async function cloneRepo({ repoUrl, branch = 'main', projectId, sessionId, request = '' }) {
  if (!isHttpUrl(repoUrl)) {
    throw new ApiError(400, 'repo_url must be a valid http(s) URL', 'REPO_CLONE_FAILED', 'REPO_CLONE');
  }
  if (!projectId) throw new ApiError(400, 'projectId is required for clone', 'REPO_CLONE_FAILED', 'REPO_CLONE');

  const repoPath = repoPathFor(projectId, sessionId);
  // Start from a clean target directory.
  await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(path.dirname(repoPath), { recursive: true });

  await git(['clone', '--depth', '1', '--single-branch', '--branch', branch, repoUrl, repoPath], path.dirname(repoPath))
    .catch(async (err) => {
      // Fallback: clone default branch when the requested branch is missing.
      if (branch !== 'main') throw err;
      await git(['clone', '--depth', '1', repoUrl, repoPath], path.dirname(repoPath));
    });

  // Repo must not be empty (at least one tracked file).
  const tracked = (await git(['ls-files'], repoPath)).trim();
  if (!tracked) {
    throw new ApiError(422, 'Cloned repo is empty', 'REPO_CLONE_FAILED', 'REPO_CLONE');
  }

  // Identity for commits inside the isolated clone (never touches global config).
  await git(['config', 'user.email', 'aifa-bot@local'], repoPath);
  await git(['config', 'user.name', 'AIFA Bot'], repoPath);

  const workingBranch = `aifa/${slugify(request)}`;
  await git(['checkout', '-B', workingBranch], repoPath);

  logger.info('repo cloned', { projectId, repoUrl, branch, workingBranch });
  return { repoPath, workingBranch, baseBranch: branch };
}

/**
 * T1.1b — open an ALREADY-CLONED local folder as the workflow repo (no network
 * clone). Used by the "Open folder" flow: the user points at a repo they cloned
 * themselves, we validate it is a real git work-tree, then cut the working
 * branch `aifa/<slug>` from the current HEAD. The base branch (current branch)
 * is returned so commitAndDiff can diff against it.
 * @returns {{ repoPath, workingBranch, baseBranch }}
 */
async function useLocalRepo({ repoPath, branch = 'main', projectId, request = '' }) {
  const resolved = path.resolve(String(repoPath || '').trim());
  if (!resolved || !String(repoPath || '').trim()) {
    throw new ApiError(400, 'repo_path is required', 'REPO_OPEN_FAILED', 'REPO_OPEN');
  }
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (_) {
    throw new ApiError(400, `Folder not found: ${resolved}`, 'REPO_OPEN_FAILED', 'REPO_OPEN');
  }
  if (!stat.isDirectory()) {
    throw new ApiError(400, `Not a folder: ${resolved}`, 'REPO_OPEN_FAILED', 'REPO_OPEN');
  }
  // Must be a git work-tree (the user is expected to have cloned it already).
  try {
    await git(['rev-parse', '--is-inside-work-tree'], resolved);
  } catch (_) {
    throw new ApiError(400, `Folder is not a git repository (no .git): ${resolved}`, 'REPO_OPEN_FAILED', 'REPO_OPEN');
  }
  const tracked = (await git(['ls-files'], resolved)).trim();
  if (!tracked) {
    throw new ApiError(422, 'Repo has no tracked files', 'REPO_OPEN_FAILED', 'REPO_OPEN');
  }

  // Local identity for commits inside this work-tree (does not touch global config).
  await git(['config', 'user.email', 'aifa-bot@local'], resolved).catch(() => {});
  await git(['config', 'user.name', 'AIFA Bot'], resolved).catch(() => {});

  // Remember the branch we started from so commitAndDiff can diff against it.
  let baseBranch = branch;
  try {
    const head = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], resolved)).trim();
    if (head && head !== 'HEAD') baseBranch = head;
  } catch (_) { /* keep default */ }

  const workingBranch = `aifa/${slugify(request)}`;
  await git(['checkout', '-B', workingBranch], resolved);

  logger.info('local repo opened', { projectId, repoPath: resolved, workingBranch, baseBranch });
  return { repoPath: resolved, workingBranch, baseBranch };
}

/**
 * Normalize a browser-uploaded relative path (webkitRelativePath) into a safe
 * repo-relative path. Browsers prepend the chosen folder name, so we drop the
 * first segment; we also refuse traversal and skip the original `.git` metadata
 * (we re-init our own repo).
 * @returns {string|null} repo-relative path, or null if it must be skipped.
 */
function normalizeUploadPath(relativePath) {
  const cleaned = String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!cleaned) return null;
  const segs = cleaned.split('/').filter(Boolean);
  if (segs.length > 1) segs.shift();      // drop the browser's top-level folder name
  if (!segs.length) return null;
  if (segs.includes('..')) return null;   // no path traversal
  if (segs[0] === '.git') return null;     // never import original git metadata
  return segs.join('/');
}

/**
 * Open a folder UPLOADED from the browser (files arrive as in-memory buffers,
 * since a web page cannot read an absolute filesystem path). We write the files
 * into the isolated per-project workspace, then `git init` a fresh repo so the
 * rest of the pipeline (branch / commit / diff / report) works unchanged.
 * @param {{ projectId:string, files:Array<{relativePath:string, buffer:Buffer}>, request?:string }} args
 * @returns {{ repoPath, baseBranch, fileCount }}
 */
async function prepareUploadedRepo({ projectId, files = [], request = '' }) {
  if (!projectId) throw new ApiError(400, 'projectId is required', 'REPO_OPEN_FAILED', 'REPO_OPEN');
  if (!Array.isArray(files)) {
    throw new ApiError(400, 'Files must be an array', 'REPO_OPEN_FAILED', 'REPO_OPEN');
  }

  const repoPath = repoPathFor(projectId);
  await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(repoPath, { recursive: true });

  let written = 0;
  for (const file of files) {
    const rel = normalizeUploadPath(file.relativePath);
    if (!rel || !isWithinRepo(repoPath, rel)) continue;
    const dest = path.join(repoPath, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, file.buffer);
    written += 1;
  }
  // Even if no files were written (empty folder), we still initialize the repo.

  // Fresh repo: own identity, base branch `main`, one import commit.
  await git(['init'], repoPath);
  await git(['config', 'user.email', 'aifa-bot@local'], repoPath);
  await git(['config', 'user.name', 'AIFA Bot'], repoPath);
  await git(['checkout', '-B', 'main'], repoPath).catch(() => {});
  if (written > 0) {
    await git(['add', '-A'], repoPath);
    await git(['commit', '-m', 'aifa: imported uploaded folder'], repoPath).catch(() => {});
  } else {
    await git(['commit', '--allow-empty', '-m', 'aifa: initialized empty project'], repoPath).catch(() => {});
  }

  logger.info('uploaded repo prepared', { projectId, repoPath, fileCount: written });
  return { repoPath, baseBranch: 'main', fileCount: written };
}

/**
 * T1.2 — stage + commit all working-tree changes, return the diff vs base branch.
 * @returns {{ committed: boolean, diff: string, commitHash: string|null }}
 */
async function commitAndDiff({ repoPath, branch = 'main', message = 'aifa: agent changes' }) {
  await git(['add', '-A'], repoPath);
  const status = (await git(['status', '--porcelain'], repoPath)).trim();
  let committed = false;
  let commitHash = null;
  if (status) {
    await git(['commit', '-m', message], repoPath);
    commitHash = (await git(['rev-parse', 'HEAD'], repoPath)).trim();
    committed = true;
  }
  // Diff working branch vs base. If base ref is unknown (shallow clone), diff
  // the last commit instead so the caller still sees what changed.
  let diff = '';
  try {
    diff = await git(['diff', `${branch}...HEAD`], repoPath);
  } catch (_) {
    diff = commitHash ? await git(['show', '--stat', 'HEAD'], repoPath) : '';
  }
  return { committed, diff, commitHash };
}

/**
 * T1.3 — repo safety. Scan tracked files for secrets and flag them so the agent
 * layer never reads them. We never execute scripts found inside the repo.
 * @returns {{ safe: boolean, blockedReads: string[], warnings: string[] }}
 */
async function assertRepoSafe(repoPath) {
  const warnings = [];
  let files = [];
  try {
    files = (await git(['ls-files'], repoPath)).split('\n').map((f) => f.trim()).filter(Boolean);
  } catch (err) {
    return { safe: false, blockedReads: [], warnings: [`Could not list repo files: ${err.message}`] };
  }
  const blockedReads = files.filter((file) => SECRET_PATTERNS.some((re) => re.test(file)));
  if (blockedReads.length) {
    warnings.push(`${blockedReads.length} secret-like file(s) flagged as no-read: ${blockedReads.join(', ')}`);
    logger.warn('repo safety: secret files flagged', { repoPath, blockedReads });
  }
  return { safe: true, blockedReads, warnings };
}

/** True if `relPath` is one the agent must not read (secret). */
function isBlockedPath(relPath) {
  return SECRET_PATTERNS.some((re) => re.test(String(relPath || '')));
}

/** True if `relPath` stays inside the repo (no path traversal / absolute escape). */
function isWithinRepo(repoPath, relPath) {
  const resolved = path.resolve(repoPath, relPath);
  const root = path.resolve(repoPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** T1.3 — remove the per-project workspace when a workflow ends/aborts. */
async function cleanupWorkspace(projectId) {
  if (!projectId) return false;
  const dir = path.join(WORKSPACE_DIR, projectId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  logger.info('workspace cleaned', { projectId });
  return true;
}

module.exports = {
  cloneRepo,
  useLocalRepo,
  prepareUploadedRepo,
  prepareSessionRepo,
  commitAndDiff,
  assertRepoSafe,
  cleanupWorkspace,
  isBlockedPath,
  isWithinRepo,
  repoPathFor,
  slugify,
  isHttpUrl,
  WORKSPACE_DIR,
  SECRET_PATTERNS,
  git,
};

