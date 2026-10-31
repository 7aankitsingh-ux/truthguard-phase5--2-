import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import authRouter from './auth.js';
import dataRouter from './data.js';
import verifyRouter from './verify.js';
import reportsRouter from './reports.js';

const router = Router();

router.get('/health', async (req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

router.use('/auth', authRouter);
router.use('/reports', reportsRouter);
router.use(requireAuth, dataRouter);
router.use('/verify', requireAuth, verifyRouter);

export default router;
