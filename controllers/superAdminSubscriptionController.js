import Company from '../models/Company.js';
import Invoice from '../models/Invoice.js';
import PaymentGatewayConfig from '../models/PaymentGatewayConfig.js';
import AuditLog from '../models/AuditLog.js';
import { PLANS, calculateGST } from '../config/plans.js';
import { activateSubscription, cancelSubscription, addWhatsAppCredits } from '../services/subscription.service.js';
import { getRazorpayInstance } from '../services/razorpay.service.js';

// ─── GET /api/superadmin/billing/overview ─────────────────────────────────────
export const getBillingOverview = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      planBreakdown,
      mrrData,
      recentInvoices,
      expiringSoon,
      inGrace,
    ] = await Promise.all([
      // Companies per plan
      Company.aggregate([
        { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
      ]),

      // Revenue this month
      Invoice.aggregate([
        { $match: { paymentStatus: 'paid', paidAt: { $gte: startOfMonth } } },
        { $group: { _id: '$type', total: { $sum: '$baseAmount' }, gst: { $sum: '$gstAmount' }, count: { $sum: 1 } } },
      ]),

      // Last 10 invoices
      Invoice.find({ paymentStatus: 'paid' })
        .sort({ paidAt: -1 }).limit(10)
        .populate('company', 'name email')
        .lean(),

      // Subscriptions expiring in next 7 days
      Company.find({
        'subscription.status': 'active',
        'subscription.plan': { $ne: 'free' },
        'subscription.endDate': { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) },
      }).select('name email subscription').lean(),

      // Companies in grace period
      Company.find({ 'subscription.status': 'grace_period' })
        .select('name email subscription').lean(),
    ]);

    // Calculate MRR — monthly recurring revenue (base, before GST)
    let mrr = 0;
    for (const company of await Company.find({ 'subscription.status': 'active', 'subscription.plan': { $ne: 'free' } }).select('subscription').lean()) {
      const plan = PLANS[company.subscription.plan];
      if (!plan) continue;
      if (company.subscription.billingCycle === 'yearly') {
        mrr += plan.yearlyPrice / 12;
      } else {
        mrr += plan.monthlyPrice;
      }
    }

    const revenueThisMonth = mrrData.reduce((sum, r) => sum + r.total, 0);
    const gstThisMonth = mrrData.reduce((sum, r) => sum + r.gst, 0);

    res.json({
      success: true,
      data: {
        mrr: Math.round(mrr),
        revenueThisMonth: Math.round(revenueThisMonth),
        gstThisMonth: Math.round(gstThisMonth),
        totalThisMonth: Math.round(revenueThisMonth + gstThisMonth),
        planBreakdown: planBreakdown.reduce((a, p) => ({ ...a, [p._id]: p.count }), {}),
        revenueByType: mrrData,
        recentInvoices,
        expiringSoon,
        inGrace,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/superadmin/billing/invoices ─────────────────────────────────────
export const getAllInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, search } = req.query;
    const filter = {};
    if (status) filter.paymentStatus = status;
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'billingSnapshot.companyName': { $regex: search, $options: 'i' } },
      ];
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('company', 'name email')
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    res.json({ success: true, data: invoices, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/billing/manual-activate ────────────────────────────
// Super admin manually activates a plan for a company (bank transfer / offline payment)
export const manualActivate = async (req, res) => {
  try {
    const { companyId, plan, billingCycle, note } = req.body;

    if (!PLANS[plan]) return res.status(400).json({ success: false, message: 'Invalid plan' });

    const { company, invoice } = await activateSubscription({
      companyId,
      plan,
      billingCycle: billingCycle || 'monthly',
      markedManuallyBy: req.user._id,
      manualNote: note || 'Manually activated by super admin',
    });

    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: 'super_admin', ip: req.ip },
      company: { id: companyId, name: company.name },
      action: 'COMPANY_PLAN_CHANGED',
      description: `Manually activated ${PLANS[plan].name} plan (${billingCycle}). Note: ${note || 'none'}`,
      changes: { after: { plan, billingCycle } },
      severity: 'info',
    });

    res.json({ success: true, message: `${PLANS[plan].name} plan activated for ${company.name}`, data: { invoice } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/billing/add-whatsapp-credits ───────────────────────
export const manualAddCredits = async (req, res) => {
  try {
    const { companyId, pack, note } = req.body;
    const { invoice, totalCredits } = await addWhatsAppCredits({
      companyId,
      pack,
      markedManuallyBy: req.user._id,
    });

    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: 'super_admin', ip: req.ip },
      company: { id: companyId },
      action: 'COMPANY_LIMIT_UPDATED',
      description: `Manually added ${totalCredits} WhatsApp credits. Note: ${note || 'none'}`,
    });

    res.json({ success: true, message: `${totalCredits} WhatsApp credits added`, data: { invoice } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/billing/cancel ─────────────────────────────────────
export const adminCancelSubscription = async (req, res) => {
  try {
    const { companyId, reason } = req.body;
    const company = await cancelSubscription(companyId, reason);

    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: 'super_admin', ip: req.ip },
      company: { id: companyId, name: company.name },
      action: 'COMPANY_PLAN_CHANGED',
      description: `Subscription cancelled. Reason: ${reason || 'none'}`,
      severity: 'warning',
    });

    res.json({ success: true, message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/superadmin/billing/gateway-config ───────────────────────────────
export const getGatewayConfig = async (req, res) => {
  try {
    const config = await PaymentGatewayConfig.findOne({ gateway: 'razorpay' }).lean();
    if (!config) return res.json({ success: true, data: null });

    // Mask the secret key — never send full secret to frontend
    const safe = { ...config };
    if (safe.razorpay?.keySecret) {
      safe.razorpay.keySecret = safe.razorpay.keySecret.slice(0, 8) + '••••••••••••••••';
    }
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/superadmin/billing/gateway-config ───────────────────────────────
export const saveGatewayConfig = async (req, res) => {
  try {
    const { keyId, keySecret, webhookSecret, mode } = req.body;

    if (!keyId || !keySecret) {
      return res.status(400).json({ success: false, message: 'Key ID and Key Secret are required' });
    }

    const existing = await PaymentGatewayConfig.findOne({ gateway: 'razorpay' });
    const updateData = {
      gateway: 'razorpay',
      isActive: true,
      'razorpay.keyId': keyId,
      'razorpay.mode': mode || 'test',
      'razorpay.webhookSecret': webhookSecret || existing?.razorpay?.webhookSecret,
      updatedBy: req.user._id,
      testStatus: 'untested',
    };

    // Only update secret if a new one is provided (not the masked version)
    if (keySecret && !keySecret.includes('••••')) {
      updateData['razorpay.keySecret'] = keySecret;
    }

    await PaymentGatewayConfig.findOneAndUpdate(
      { gateway: 'razorpay' },
      { $set: updateData },
      { upsert: true, new: true }
    );

    await AuditLog.log({
      actor: { id: req.user._id, email: req.user.email, role: 'super_admin', ip: req.ip },
      action: 'SYSTEM_CONFIG_CHANGED',
      description: `Razorpay gateway config updated. Mode: ${mode}`,
      severity: 'warning',
    });

    res.json({ success: true, message: 'Payment gateway config saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/billing/test-gateway ───────────────────────────────
export const testGateway = async (req, res) => {
  try {
    const razorpay = await getRazorpayInstance();
    // Try a minimal API call to verify keys work
    await razorpay.orders.all({ count: 1 });

    await PaymentGatewayConfig.findOneAndUpdate(
      { gateway: 'razorpay' },
      { testStatus: 'success', lastTestedAt: new Date() }
    );

    res.json({ success: true, message: '✅ Razorpay keys are working correctly' });
  } catch (err) {
    await PaymentGatewayConfig.findOneAndUpdate(
      { gateway: 'razorpay' },
      { testStatus: 'failed', lastTestedAt: new Date() }
    );
    res.status(400).json({ success: false, message: `❌ Razorpay test failed: ${err.message}` });
  }
};
