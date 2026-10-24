import { logger } from 'firebase-functions/v2';

export interface NamedJob {
  name: string;
  run: () => Promise<unknown>;
  /** Absent means always run. */
  when?: (now: Date) => boolean;
}

/**
 * Runs the jobs of one scheduler sequentially, in array order. Never throws: a failing job is logged
 * and reported in `failed`, later jobs still run. Jobs whose `when(now)` is false are skipped.
 */
export async function runJobs(scheduler: string, jobs: NamedJob[], now: Date = new Date()): Promise<{ ran: string[]; skipped: string[]; failed: string[] }> {
  const ran: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const job of jobs) {
    const start = Date.now();
    try {
      if (job.when && !job.when(now)) {
        skipped.push(job.name);
        continue;
      }
      await job.run();
      ran.push(job.name);
      logger.info(`${scheduler}:${job.name} done`, { durationMs: Date.now() - start });
    } catch (err) {
      failed.push(job.name);
      // Error as a positional arg, not inside the object: the logger then keeps its text/stack in the message and durationMs stays structured.
      logger.error(`${scheduler}:${job.name} failed`, err, { durationMs: Date.now() - start });
    }
  }
  return { ran, skipped, failed };
}
