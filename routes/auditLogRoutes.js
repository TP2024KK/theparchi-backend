import express from 'express';
import AuditLog from '../models/AuditLog.js';
import { protect } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();
router.use(protect, requireSuperAdmin);

// GET /api/superadmin/audit-logs
// Query: page, limit, action, status, severity, startDate, endDate, search
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, action, status, severity, startDate, endDate, search } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { 'actor.email': { $regex: search, $options: 'i' } },
        { 'actor.name': { $regex: search, $options: 'i' } },
        { 'company.name': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/audit-logs/stats?period=24h
router.get('/stats', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    const hours = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 }[period] || 24;
    const since = new Date(Date.now() - hours * 3600000);

    const [total, byStatus, bySeverity, topActions, recentFailures] = await Promise.all([
      AuditLog.countDocuments({ createdAt: { $gte: since } }),
      AuditLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      AuditLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.find({ status: 'failure', createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    res.json({
      success: true,
      data: {
        total, period,
        byStatus: byStatus.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}),
        bySeverity: bySeverity.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}),
        topActions,
        recentFailures,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/audit-logs/timeline?period=24h
router.get('/timeline', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    const cfg = {
      '24h': { hours: 24, fmt: '%Y-%m-%dT%H:00:00' },
      '7d': { hours: 168, fmt: '%Y-%m-%d' },
      '30d': { hours: 720, fmt: '%Y-%m-%d' },
    };
    const { hours, fmt } = cfg[period] || cfg['24h'];
    const since = new Date(Date.now() - hours * 3600000);

    const timeline = await AuditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: fmt, date: '$createdAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.period': 1 } },
    ]);

    res.json({ success: true, data: { timeline, period } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/audit-logs/:id
router.get('/:id', async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/superadmin/audit-logs/purge — body: { olderThanDays: 90 }
router.delete('/purge', async (req, res) => {
  try {
    const { olderThanDays = 90 } = req.body;
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    res.json({ success: true, data: { deletedCount: result.deletedCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
