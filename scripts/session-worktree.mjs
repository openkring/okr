#!/usr/bin/env node
// Per-session git worktrees for parallel Claude/dev sessions.
//
// Each session gets its own directory + `work/<name>` branch so sessions never
// collide in a shared working tree. Integrate back to main with a fast-forward
// merge once green. See CLAUDE.md > Hard Rules > branching for the workflow.
//
//   pnpm session:new    <name>   create ../okr-worktrees/<name> on work/<name>
//   pnpm session:sync   <name>   rebase work/<name> onto latest origin/main
//   pnpm session:list            list worktrees
//   pnpm session:remove <name>   remove the worktree (branch kept unless --force)

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repoRoot = execSync('git rev-parse --show-toplevel').toString().trim();
const worktreesDir = resolve(dirname(repoRoot), 'okr-worktrees');

const git = (args, opts = {}) =>
  execFileSync('git', args, { stdio: 'inherit', cwd: repoRoot, ...opts });
const gitOut = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot, ...opts }).trim();

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

const validName = (name) => {
  if (!name) die('Missing <name>. Usage: pnpm session:new <name>');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
    die(`Invalid name "${name}". Use lower-case letters, digits and dashes.`);
  return name;
};

const baseRef = () => {
  try {
    git(['fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore' });
  } catch {
    console.warn('⚠ could not fetch origin/main — basing on local ref');
  }
  try {
    gitOut(['rev-parse', '--verify', '--quiet', 'origin/main']);
    return 'origin/main';
  } catch {
    return 'main';
  }
};

const cmd = process.argv[2];
const name = process.argv[3];

switch (cmd) {
  case 'new': {
    validName(name);
    const path = join(worktreesDir, name);
    const branch = `work/${name}`;
    if (existsSync(path)) die(`Worktree path already exists: ${path}`);

    const base = baseRef();
    console.log(`\n→ Creating worktree ${path} on ${branch} (from ${base})`);
    git(['worktree', 'add', '-b', branch, path, base]);

    console.log('\n→ Installing dependencies (pnpm install)…');
    execSync('pnpm install', { stdio: 'inherit', cwd: path });

    const noOpen = process.argv.includes('--no-open');
    if (!noOpen) {
      try {
        execFileSync('code', [path], { stdio: 'ignore' });
        console.log(`\n→ Opened ${path} in a new VSCode window — click the Claude icon there.`);
      } catch {
        console.warn('\n⚠ `code` CLI not found — open the folder manually, or run with --no-open to silence this.');
      }
    }

    console.log(`\n✓ Worktree ready.\n
  In the new window (or after cd ${path}):
    source ./apps/scs-app/.env && node ./set-env.js   # regenerate env (git-ignored, per-worktree)

  Integrate when green (from the main checkout at ${repoRoot}):
    git fetch origin && git merge --ff-only ${branch}   # or open a short-lived PR
    pnpm session:remove ${name}\n`);
    break;
  }

  case 'sync': {
    validName(name);
    const path = join(worktreesDir, name);
    if (!existsSync(path)) die(`No worktree at ${path}. Create it with: pnpm session:new ${name}`);
    const base = baseRef();
    console.log(`\n→ Rebasing work/${name} onto ${base}…`);
    execFileSync('git', ['rebase', base], { stdio: 'inherit', cwd: path });
    console.log('\n✓ Rebased. Resolve any conflicts, then re-run tests.\n');
    break;
  }

  case 'list':
    git(['worktree', 'list']);
    break;

  case 'remove': {
    validName(name);
    const path = join(worktreesDir, name);
    const branch = `work/${name}`;
    const force = process.argv.includes('--force');
    if (!existsSync(path)) die(`No worktree at ${path}.`);

    // `git worktree remove` refuses outright on a tree containing submodules
    // ("working trees containing submodules cannot be moved or removed"), which is
    // every worktree here (planning, apps/*, .claude/skills). So we delete the
    // directory ourselves — which means git's own safety net is gone and we have to
    // re-implement it: refuse while anything is unsaved, unless --force.
    if (!force) {
      // Tracked changes in the superproject. --ignore-submodules=dirty still reports a
      // moved submodule pointer (a real, committed change) but not their untracked files.
      const dirty = gitOut(['-C', path, 'status', '--porcelain', '--ignore-submodules=dirty']);
      if (dirty)
        die(`Worktree ${path} has uncommitted changes:\n\n${dirty}\n\nCommit them, or re-run with --force to discard.`);

      // Commits sitting in a submodule that were never pushed would be unrecoverable.
      const unpushed = gitOut([
        '-C', path, 'submodule', 'foreach', '--quiet',
        'n=$(git log --oneline @{u}..HEAD 2>/dev/null | wc -l | tr -d " "); [ "$n" = "0" ] || echo "  $name: $n unpushed commit(s)"'
      ]);
      if (unpushed)
        die(`Submodules in ${path} have unpushed commits:\n\n${unpushed}\n\nPush them, or re-run with --force to discard.`);
    }

    console.log(`\n→ Removing worktree ${path}`);
    try {
      // stdio ignored: the submodule refusal below is expected, not worth printing.
      git(['worktree', 'remove', ...(force ? ['--force'] : []), path], { stdio: 'ignore' });
    } catch {
      // Expected whenever the worktree has submodules — delete + prune the registration.
      rmSync(path, { recursive: true, force: true });
      git(['worktree', 'prune']);
    }
    if (force) {
      try {
        git(['branch', '-D', branch]);
        console.log(`✓ Deleted branch ${branch}`);
      } catch {
        /* branch may already be gone */
      }
    } else {
      console.log(`\n✓ Worktree removed. Branch ${branch} kept.
  Delete it once merged:  git branch -d ${branch}\n`);
    }
    break;
  }

  default:
    console.log(`Per-session git worktrees for parallel work.

  pnpm session:new    <name> [--no-open] create a worktree + work/<name> branch (opens VSCode unless --no-open)
  pnpm session:sync   <name>          rebase work/<name> onto latest origin/main
  pnpm session:list                   list all worktrees
  pnpm session:remove <name> [--force] remove worktree (--force also deletes branch)`);
    process.exit(cmd ? 1 : 0);
}
