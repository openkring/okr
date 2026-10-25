import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';

// Handlers keep their own request typing (and their own role guard): the router checks nothing per op.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpHandler = (request: CallableRequest<any>) => Promise<unknown>;

/**
 * The body of a consolidated callable: picks the handler by `request.data.op` and calls it with the
 * request minus `op`, so the handler sees the shape its old stand-alone callable received.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchOp(name: string, ops: Record<string, OpHandler>, request: CallableRequest<any>): Promise<unknown> {
  const op: unknown = request.data?.op;
  if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(ops, op)) {
    throw new HttpsError('invalid-argument', 'unknown op');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { op: _op, ...data } = request.data;
  try {
    return await ops[op]({ ...request, data });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    // Error as a positional arg: inside an object firebase-functions serialises it to {}.
    logger.error(`${name}:${op} failed`, err);
    throw err;
  }
}

/** One callable from an op table. No Sentry reporting here: it needs a secret none of the ops has. */
export function makeOpRouter(name: string, options: CallableOptions, ops: Record<string, OpHandler>): ReturnType<typeof onCall> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return onCall(options, (request: CallableRequest<any>) => dispatchOp(name, ops, request));
}
