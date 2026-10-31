import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readdir, stat, unlink } from 'node:fs/promises';
import * as path from 'node:path';

/** Nothing this instance is legitimately working on can be older than one full invocation (540 s, the longest ffmpeg function). */
const TMP_MAX_AGE_MS = 540 * 1000;

/** Run ffmpeg once. Rejects with the tail of stderr, which is where ffmpeg says what went wrong. */
export async function runFfmpeg(binary: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1000)}`)));
  });
}

/**
 * Run `ffmpeg` with probe arguments (`-i <input>`) and return what it prints about the file. ffmpeg exits non-zero here
 * ("at least one output file must be specified"), which is expected: only stderr matters.
 */
export async function probeFfmpeg(binary: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-20000); });
    child.on('error', reject);
    child.on('close', () => resolve(stderr));
  });
}

/**
 * Delete leftovers of an invocation that never reached its `finally` — a timeout or an OOM kills
 * the instance outright, and `/tmp` is tmpfs, i.e. it counts against the memory limit. Without this
 * the victim is not the video that failed but the NEXT, healthy one, which dies of an OOM that
 * reads like an ffmpeg error in the log.
 *
 * Anything older than one full invocation cannot belong to work still in flight. Every error is
 * ignored: housekeeping must never be the reason a transcode does not happen.
 */
export async function reapStaleTempFiles(): Promise<void> {
  const dir = tmpdir();
  const cutoff = Date.now() - TMP_MAX_AGE_MS;
  try {
    const names = await readdir(dir);
    await Promise.all(names.map(async (name) => {
      const file = path.join(dir, name);
      try {
        const info = await stat(file);
        if (info.isFile() && info.mtimeMs < cutoff) await unlink(file);
      } catch {
        // gone already, a directory, or not ours to delete — none of it is our problem
      }
    }));
  } catch {
    // /tmp unreadable — nothing to do
  }
}
