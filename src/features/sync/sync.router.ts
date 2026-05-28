import { Router } from 'express';
import { handleError } from '../../shared/middleware/errorHandler.js';
import { runTickTickSync, runNotionSync } from './sync.service.js';

const router = Router();

router.post('/api/sync', async (_req, res) => {
  try {
    const result = await runTickTickSync();
    res.json(result);
  } catch (err: any) {
    console.error('[TickTick Sync] Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

router.post('/api/sync/notion', async (_req, res) => {
  try {
    const result = await runNotionSync();
    res.json(result);
  } catch (err: any) {
    console.error(err);
    handleError(res, err);
  }
});

export default router;
