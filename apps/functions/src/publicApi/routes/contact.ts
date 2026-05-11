import { Request, Response } from 'express';
export async function contactRouter(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: { code: 'not_implemented' } });
}
