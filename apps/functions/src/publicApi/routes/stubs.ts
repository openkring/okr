import { Request, Response } from 'express';
import { setCacheHeaders } from '../utils';

export function coursesRouter(_req: Request, res: Response): void {
  setCacheHeaders(res);
  res.json([]);
}

export function resultsRouter(_req: Request, res: Response): void {
  setCacheHeaders(res);
  res.json([]);
}
