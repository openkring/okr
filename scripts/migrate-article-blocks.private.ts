/** The guard of migrate-article-blocks.ts: files with article contents never go into a repository. Reads only. */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Throws unless every one of the files would be outside a repository or git-ignored. The directory need not exist.
 * A repository that git cannot read counts as not ignored.
 */
export function assertPrivate(dir: string, fileNames: string[]): void {
  const wanted = resolve(dir);
  let existing = wanted;
  while (!existsSync(existing)) existing = dirname(existing);
  // a link must not lead into a repository unseen
  const real = realpathSync(existing);
  if (!isInRepository(real)) return;
  const target = join(real, relative(existing, wanted));
  const exposed = fileNames.filter((name) => spawnSync('git', ['-C', real, 'check-ignore', '-q', '--', join(target, name)], { stdio: 'ignore' }).status !== 0);
  if (exposed.length > 0) throw new Error(`${dir} is part of a repository and not git-ignored for ${exposed.join(', ')}`);
}

function isInRepository(dir: string): boolean {
  return existsSync(join(dir, '.git')) || (dirname(dir) !== dir && isInRepository(dirname(dir)));
}
