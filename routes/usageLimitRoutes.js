import express from 'express';
import UsageLimit from '../models/UsageLimit.js';
import AuditLog from '../models/AuditLog.js';
import { protect } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();
router.use(protect, requireSuperAdmin);

const LIMIT_MAP = {
  users: 'maxUsers',
  invitesSentThisMonth: 'maxInvitesPerMonth',
  storageUsedMb: 'maxStorageMb',
  apiCallsToday: 'maxApiCallsPerDay',
  challansThisMonth: 'maxChallansPerMonth',
};

function computePercentages(doc) {
  const result = {};
  for (const [ck, lk] of Object.entries(LIMIT_MAP)) {
    const limit = doc.limits?.[lk] ?? -1;
    const current = doc.current?.[ck] ?? 0;
    result[ck] = limit === -1
      ? { percent: 0, current, limit: -1, unlimited: true }
      : { percent: limit > 0 ? Math.round((current / limit) * 100) : 0, current, limit };
  }
  return result;
}

function isAtRisk(doc) {
  const warnAt = doc.enforcement?.warnAtPercent ?? 80;
  return Object.values(computePercentages(doc)).some(p => !p.unlimited && p.percent >= warnAt);
}

// GET /api/superadmin/usage-limits
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [docs, total] = await Promise.all([
      UsageLimit.find()
        .populate('company', 'name email status plan')
        .sort({ updatedAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      UsageLimit.countDocuments(),
    ]);
    const data = docs.map(d => ({ ...d, percentages: computePercentages(d), atRisk: isAtRisk(d) }));
    res.json({ success: true, data, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/usage-limits/at-risk  ← MUST be before /:companyId
router.get('/at-risk', async (req, res) => {
  try {
    const docs = await UsageLimit.find().populate('company', 'name email status').lean();
    const atRisk = docs.map(d => ({ ...d, percentages: computePercentages(d) })).filter(d => isAtRisk(d));
    res.json({ success: true, data: atRisk, total: atRisk.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/usage-limits/:companyId
router.get('/:companyId', async (req, res) => {
  try {
    let doc = await UsageLimit.findOne({ company: req.params.companyId })
      .populate('company', 'name email status plan').lean();
    if (!doc) {
      const created = await UsageLimit.create({ company: req.params.companyId });
      doc = await UsageLimit.findById(created._id).populate('company', 'name email status plan').lean();
    }
    res.json({ success: true, data: { ...doc, percentages: computePercentages(doc) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/superadmin/usage-limits/:companyId/limits
// Body: { limits: { maxUsers: 10, maxChallansPerMonth: 500 } }
router.patch('/:companyId/limits', async (req, res) => {
  try {
    const { limits } = req.body;
    const before = await UsageLimit.findOne({ company: req.params.companyId }).lean();
    const updated = await UsageLimit.findOneAndUpdate(
      { company: req.params.companyId },
      { $set: { limits } },
      { new: true, upsert: true }
    ).populate('company', 'name').lean();

    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: req.user.role, ip: req.ip },
      company: { id: req.params.companyId, name: updated.company?.name },
      action: 'COMPANY_LIMIT_UPDATED',
      description: `Updated usage limits for ${updated.company?.name || req.params.companyId}`,
      changes: { before: before?.limits, after: limits },
      resource: { type: 'company', id: req.params.companyId },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/superadmin/usage-limits/:companyId/override
// Body: { reason: 'string', expiresAt: 'YYYY-MM-DD' (optional) }
router.post('/:companyId/override', async (req, res) => {
  try {
    const { reason, expiresAt } = req.body;
    if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Reason is required' });

    const updated = await UsageLimit.findOneAndUpdate(
      { company: req.params.companyId },
      {
        $set: {
          overrides: {
            active: true,
            reason,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            grantedBy: req.user._id,
          },
        },
      },
      { new: true, upsert: true }
    ).lean();

    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: req.user.role, ip: req.ip },
      company: { id: req.params.companyId },
      action: 'COMPANY_LIMIT_UPDATED',
      description: `Limit override granted: ${reason}`,
      severity: 'warning',
      metadata: { reason, expiresAt },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/superadmin/usage-limits/:companyId/override
router.delete('/:companyId/override', async (req, res) => {
  try {
    await UsageLimit.findOneAndUpdate(
      { company: req.params.companyId },
      { $set: { 'overrides.active': false } }
    );
    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: req.user.role, ip: req.ip },
      company: { id: req.params.companyId },
      action: 'COMPANY_LIMIT_UPDATED',
      description: `Limit override removed for company ${req.params.companyId}`,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/superadmin/usage-limits/:companyId/reset-counter
// Body: { key: 'challansThisMonth' }
router.patch('/:companyId/reset-counter', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'key is required' });
    await UsageLimit.findOneAndUpdate(
      { company: req.params.companyId },
      { $set: { [`current.${key}`]: 0 } },
      { upsert: true }
    );
    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: req.user.role, ip: req.ip },
      company: { id: req.params.companyId },
      action: 'USAGE_LIMIT_RESET',
      description: `Reset counter '${key}' for company ${req.params.companyId}`,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
