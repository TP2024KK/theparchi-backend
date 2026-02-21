import UsageLimit from '../models/UsageLimit.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Middleware factory that blocks a request when a company hits its usage limit.
 *
 * How to use in any route file:
 *   import { enforceLimit } from '../middleware/usageLimit.js';
 *   router.post('/', protect, enforceLimit('challansThisMonth', 'maxChallansPerMonth'), createChallan);
 *   router.post('/', protect, enforceLimit('users', 'maxUsers'), addTeamMember);
 */
export const enforceLimit = (currentKey, limitKey) => async (req, res, next) => {
  try {
    const companyId = req.user?.company;
    if (!companyId) return next(); // super admin has no company — always bypass

    let doc = await UsageLimit.findOne({ company: companyId });
    if (!doc) doc = await UsageLimit.create({ company: companyId });

    // Active non-expired override = bypass all limits
    if (doc.overrides?.active) {
      const expired = doc.overrides.expiresAt && doc.overrides.expiresAt < new Date();
      if (!expired) return next();
      // Silently deactivate expired override
      await UsageLimit.findByIdAndUpdate(doc._id, { 'overrides.active': false });
    }

    const limit = doc.limits?.[limitKey] ?? -1;
    const current = doc.current?.[currentKey] ?? 0;

    if (limit === -1) return next(); // -1 means unlimited

    const percent = Math.round((current / limit) * 100);

    // Hard block when at or over limit
    if (current >= limit && doc.enforcement.hardBlock) {
      doc.overages.push({ resource: currentKey, detectedAt: new Date(), limitAt: limit, usageAt: current, action: 'blocked' });
      await doc.save();

      await AuditLog.log({
        actor: { id: req.user._id, email: req.user.email, role: req.user.role, ip: req.ip },
        company: { id: companyId },
        action: 'USAGE_LIMIT_ENFORCED',
        status: 'warning',
        severity: 'warning',
        description: `${currentKey} limit reached: ${current}/${limit}`,
      });

      return res.status(429).json({
        success: false,
        error: 'UsageLimitExceeded',
        message: `You've reached your ${currentKey} limit (${current}/${limit}). Please upgrade your plan.`,
        resource: currentKey,
        current,
        limit,
      });
    }

    // Soft warning at warnAtPercent threshold
    if (percent >= (doc.enforcement.warnAtPercent ?? 80)) {
      req.usageWarning = { resource: currentKey, current, limit, percent };
    }

    next();
  } catch (err) {
    console.error('[enforceLimit]', err.message);
    next(); // never block the app due to a limit check failure
  }
};

/**
 * Increment a usage counter after a successful action.
 * Call AFTER the DB operation succeeds.
 * e.g. await incrementUsage(req.user.company, 'challansThisMonth');
 */
export const incrementUsage = async (companyId, key, by = 1) => {
  try {
    await UsageLimit.findOneAndUpdate(
      { company: companyId },
      { $inc: { [`current.${key}`]: by } },
      { upsert: true }
    );
  } catch (err) {
    console.error('[incrementUsage]', err.message);
  }
};

/**
 * Decrement a usage counter when something is deleted.
 * e.g. await decrementUsage(companyId, 'users');
 */
export const decrementUsage = async (companyId, key, by = 1) => {
  try {
    await UsageLimit.findOneAndUpdate(
      { company: companyId },
      { $inc: { [`current.${key}`]: -by } },
      { upsert: true }
    );
  } catch (err) {
    console.error('[decrementUsage]', err.message);
  }
};
