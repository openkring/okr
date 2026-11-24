/** Runs jobs one after the other; a job that throws or rejects never stops the jobs after it. */
export function createSerialQueue(): (job: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (job) => {
    const run = tail.then(job).catch(() => undefined);
    tail = run;
    return run;
  };
}
