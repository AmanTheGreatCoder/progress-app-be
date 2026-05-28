import type { Response } from 'express';

export function handleError(res: Response, err: any): void {
  res.status(500).json({ error: err.message });
}
