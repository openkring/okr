import { Request, Response } from 'express';
import { setCacheHeaders } from '../utils';

export function resultsRouter(_req: Request, res: Response): void {
  setCacheHeaders(res);
  res.json([]);
}
