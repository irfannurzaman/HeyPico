import express from 'express';
import { getUsageStats } from '../middleware/security.js';

const router = express.Router();

router.get('/stats', async (req, res) => {
  try {
    const stats = await getUsageStats();
    res.json({
      status: 'success',
      ...stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as usageRouter };
