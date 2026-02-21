import Company from '../models/Company.js';

/**
 * Middleware that checks if a company's subscription allows them to operate.
 * Free plan always works. Paid plans need active or grace_period status.
 *
 * Usage: router.post('/challans', protect, checkSubscription, createChallan)
 */
export const checkSubscription = async (req, res, next) => {
  try {
    if (!req.user?.company) return next(); // super admin bypass

    const company = await Company.findById(req.user.company)
      .select('subscription limits usage isActive')
      .lean();

    if (!company || !company.isActive) {
      return res.status(403).json({
        success: false,
        error: 'AccountInactive',
        message: 'Your account is inactive. Please contact support.',
      });
    }

    const sub = company.subscription;

    // Free plan — always active
    if (sub.plan === 'free') {
      req.company = company;
      return next();
    }

    // Active paid plan
    if (sub.status === 'active') {
      req.company = company;
      return next();
    }

    // Grace period — read-only (block create/update/delete operations)
    if (sub.status === 'grace_period' && sub.graceEndDate > new Date()) {
      const method = req.method;
      const isReadOnly = method === 'GET';
      if (!isReadOnly) {
        return res.status(402).json({
          success: false,
          error: 'GracePeriod',
          message: 'Your subscription has expired. You are in a 7-day grace period. Renew now to create or edit data.',
          graceEndDate: sub.graceEndDate,
          upgradeUrl: '/settings/billing',
        });
      }
      req.company = company;
      return next();
    }

    // Suspended / cancelled / expired
    return res.status(402).json({
      success: false,
      error: 'SubscriptionExpired',
      message: 'Your subscription has expired. Please renew your plan to continue.',
      upgradeUrl: '/settings/billing',
    });
  } catch (err) {
    console.error('[checkSubscription]', err.message);
    next(); // never block on middleware error
  }
};

/**
 * Check if a specific feature is available on the company's plan.
 * Usage: router.post('/barcode', protect, requireFeature('barcodeQr'), handler)
 */
export const requireFeature = (featureKey) => async (req, res, next) => {
  try {
    if (!req.user?.company) return next(); // super admin bypass

    const { PLANS } = await import('../config/plans.js');
    const company = req.company || await Company.findById(req.user.company).select('subscription').lean();
    const plan = company?.subscription?.plan || 'free';
    const features = PLANS[plan]?.features || {};

    if (!features[featureKey]) {
      return res.status(403).json({
        success: false,
        error: 'FeatureNotAvailable',
        message: `This feature is not available on your current plan. Please upgrade to access it.`,
        feature: featureKey,
        upgradeUrl: '/settings/billing',
      });
    }
    next();
  } catch (err) {
    console.error('[requireFeature]', err.message);
    next();
  }
};
