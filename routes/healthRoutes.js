import express from 'express';
import SystemHealth from '../models/SystemHealth.js';
import { collectMetrics } from '../services/systemHealth.service.js';
import { protect } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();
router.use(protect, requireSuperAdmin);

// GET /api/superadmin/health/current — live metrics, computed on the fly
router.get('/current', async (req, res) => {
  try {
    const metrics = await collectMetrics();
    res.json({ success: true, data: metrics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/health/history?period=1h|6h|24h|7d — for charts
router.get('/history', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[period] || 24;
    const since = new Date(Date.now() - hours * 3600000);

    const history = await SystemHealth.find({ recordedAt: { $gte: since } })
      .sort({ recordedAt: -1 })
      .limit(144)
      .select('recordedAt app database.responseTimeMs database.status overallStatus')
      .lean();

    history.reverse(); // ascending order for charts
    res.json({ success: true, data: history, period });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/health/uptime
router.get('/uptime', async (req, res) => {
  try {
    const [s24, s7d] = await Promise.all([
      SystemHealth.find({ recordedAt: { $gte: new Date(Date.now() - 86400000) } }).select('overallStatus').lean(),
      SystemHealth.find({ recordedAt: { $gte: new Date(Date.now() - 7 * 86400000) } }).select('overallStatus').lean(),
    ]);
    const pct = (arr) => !arr.length ? 100
      : Math.round((arr.filter(s => s.overallStatus === 'healthy').length / arr.length) * 10000) / 100;

    res.json({
      success: true,
      data: {
        uptime24h: pct(s24),
        uptime7d: pct(s7d),
        processUptime: Math.round(process.uptime()),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
