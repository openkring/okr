import { logger } from 'firebase-functions/v2';

export interface NamedHandler<E> {
  name: string;
  run: (event: E) => Promise<unknown>;
}

/**
 * Runs all handlers concurrently for one trigger event. Never throws: a failing handler is logged
 * and reported in `failed`, the others still run to completion.
 */
export async function runHandlers<E>(trigger: string, event: E, handlers: NamedHandler<E>[]): Promise<{ failed: string[] }> {
  const results = await Promise.allSettled(
    handlers.map(async (h) => {
      try {
        return await h.run(event);
      } catch (err) {
        logger.error(`${trigger}:${h.name} failed`, err);
        throw err;
      }
    }),
  );
  const failed = handlers.filter((_, i) => results[i].status === 'rejected').map((h) => h.name);
  return { failed };
}
