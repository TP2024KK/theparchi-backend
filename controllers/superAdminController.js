import Company from '../models/Company.js';
import User from '../models/User.js';
import Challan from '../models/Challan.js';
import { PLANS } from '../config/plans.js';

// ── Overview Dashboard ────────────────────────────────────────────────────────
export const getOverview = async (req, res, next) => {
  try {
    const [
      totalCompanies,
      activeCompanies,
      suspendedCompanies,
      totalUsers,
      totalChallans,
      planCounts,
      recentCompanies
    ] = await Promise.all([
      Company.countDocuments({}),
      Company.countDocuments({ 'subscription.status': 'active' }),
      Company.countDocuments({ 'subscription.status': 'suspended' }),
      User.countDocuments({ isSuperAdmin: { $ne: true } }),
      Challan.countDocuments({}),
      Company.aggregate([{ $group: { _id: '$subscription.plan', count: { $sum: 1 } } }]),
      Company.find({}).sort({ createdAt: -1 }).limit(5).select('name email createdAt subscription.plan subscription.status')
    ]);

    // MRR calculation
    const companies = await Company.find({ 'subscription.status': 'active' }, 'subscription.price');
    const mrr = companies.reduce((sum, c) => sum + (c.subscription?.price || 0), 0);

    // Plan distribution
    const planDist = { free: 0, starter: 0, growth: 0, enterprise: 0 };
    planCounts.forEach(p => { if (p._id) planDist[p._id] = p.count; });

    // Challans today
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const challansToday = await Challan.countDocuments({ createdAt: { $gte: today } });

    // New companies today
    const newCompaniesToday = await Company.countDocuments({ createdAt: { $gte: today } });

    res.json({
      success: true,
      data: {
        companies: { total: totalCompanies, active: activeCompanies, suspended: suspendedCompanies, newToday: newCompaniesToday },
        users: { total: totalUsers },
        challans: { total: totalChallans, today: challansToday },
        revenue: { mrr, arr: mrr * 12 },
        planDistribution: planDist,
        recentCompanies
      }
    });
  } catch (error) { next(error); }
};

// ── Companies List ────────────────────────────────────────────────────────────
export const getCompanies = async (req, res, next) => {
  try {
    const { search = '', plan = '', status = '', page = 1, limit = 20 } = req.query;

    const filter = {};
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
    if (plan) filter['subscription.plan'] = plan;
    if (status) filter['subscription.status'] = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [companies, total] = await Promise.all([
      Company.find(filter)
        .populate('owner', 'name email lastLogin')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('name email phone createdAt subscription limits usage isActive suspensionReason lastLoginAt'),
      Company.countDocuments(filter)
    ]);

    // Get user counts per company
    const companyIds = companies.map(c => c._id);
    const userCounts = await User.aggregate([
      { $match: { company: { $in: companyIds }, isSuperAdmin: { $ne: true } } },
      { $group: { _id: '$company', count: { $sum: 1 } } }
    ]);
    const userCountMap = {};
    userCounts.forEach(u => { userCountMap[u._id.toString()] = u.count; });

    // Get challan counts per company
    const challanCounts = await Challan.aggregate([
      { $match: { company: { $in: companyIds } } },
      { $group: { _id: '$company', count: { $sum: 1 } } }
    ]);
    const challanCountMap = {};
    challanCounts.forEach(c => { challanCountMap[c._id.toString()] = c.count; });

    const enriched = companies.map(c => ({
      ...c.toObject(),
      userCount: userCountMap[c._id.toString()] || 0,
      challanCount: challanCountMap[c._id.toString()] || 0,
    }));

    res.json({
      success: true,
      data: enriched,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) }
    });
  } catch (error) { next(error); }
};

// ── Company Detail ────────────────────────────────────────────────────────────
export const getCompany = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id).populate('owner', 'name email lastLogin');
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const [users, challanCount, recentChallans] = await Promise.all([
      User.find({ company: company._id, isSuperAdmin: { $ne: true } }).select('name email role isActive lastLogin createdAt'),
      Challan.countDocuments({ company: company._id }),
      Challan.find({ company: company._id }).sort({ createdAt: -1 }).limit(5).select('challanNumber createdAt status grandTotal')
    ]);

    res.json({
      success: true,
      data: { company, users, challanCount, recentChallans }
    });
  } catch (error) { next(error); }
};

// ── Update Company Plan ───────────────────────────────────────────────────────
export const updateCompanyPlan = async (req, res, next) => {
  try {
    const { plan } = req.body;
    const planConfig = PLANS[plan];
    if (!planConfig) return res.status(400).json({ success: false, message: 'Invalid plan' });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    company.subscription.plan = plan;
    company.subscription.price = planConfig.price || 0;
    company.subscription.status = 'active';
    company.subscription.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    company.limits = planConfig.limits;
    await company.save();

    res.json({ success: true, message: `Plan changed to ${planConfig.name}`, data: company });
  } catch (error) { next(error); }
};

// ── Suspend Company ───────────────────────────────────────────────────────────
export const suspendCompany = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    company.subscription.status = 'suspended';
    company.isActive = false;
    company.suspensionReason = reason || 'Suspended by admin';
    await company.save();

    res.json({ success: true, message: 'Company suspended', data: company });
  } catch (error) { next(error); }
};

// ── Activate Company ──────────────────────────────────────────────────────────
export const activateCompany = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    company.subscription.status = 'active';
    company.isActive = true;
    company.suspensionReason = '';
    await company.save();

    res.json({ success: true, message: 'Company activated', data: company });
  } catch (error) { next(error); }
};

// ── All Users ─────────────────────────────────────────────────────────────────
export const getAllUsers = async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const filter = { isSuperAdmin: { $ne: true } };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];

    const [users, total] = await Promise.all([
      User.find(filter).populate('company', 'name').sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit)).limit(Number(limit))
        .select('name email role isActive lastLogin createdAt company'),
      User.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) }
    });
  } catch (error) { next(error); }
};

// ── Monthly Growth Data ───────────────────────────────────────────────────────
export const getGrowthData = async (req, res, next) => {
  try {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString('default', { month: 'short', year: '2-digit' }) });
    }

    const companiesPerMonth = await Company.aggregate([
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } }
    ]);

    const usersPerMonth = await User.aggregate([
      { $match: { isSuperAdmin: { $ne: true } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } }
    ]);

    const challanPerMonth = await Challan.aggregate([
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } }
    ]);

    const toMap = (arr) => {
      const m = {};
      arr.forEach(x => { m[`${x._id.year}-${x._id.month}`] = x.count; });
      return m;
    };

    const cMap = toMap(companiesPerMonth);
    const uMap = toMap(usersPerMonth);
    const chMap = toMap(challanPerMonth);

    const data = months.map(m => ({
      label: m.label,
      companies: cMap[`${m.year}-${m.month}`] || 0,
      users: uMap[`${m.year}-${m.month}`] || 0,
      challans: chMap[`${m.year}-${m.month}`] || 0,
    }));

    res.json({ success: true, data });
  } catch (error) { next(error); }
};

// ── Audit Logs ────────────────────────────────────────────────────────────────
export const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = '', action = '', startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    // Build query from sfpTrail across all challans
    const challanQuery = {};
    if (startDate || endDate) {
      challanQuery.createdAt = {};
      if (startDate) challanQuery.createdAt.$gte = new Date(startDate);
      if (endDate) challanQuery.createdAt.$lte = new Date(endDate);
    }

    const challans = await Challan.find(challanQuery)
      .populate('company', 'name')
      .populate('party', 'name')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .limit(500);

    // Flatten sfpTrail into audit log entries
    let logs = [];
    for (const challan of challans) {
      for (const trail of (challan.sfpTrail || [])) {
        logs.push({
          _id: trail._id,
          action: trail.action,
          at: trail.at,
          challanNumber: challan.challanNumber,
          challanId: challan._id,
          company: challan.company,
          party: challan.party,
          by: trail.by,
          channel: trail.channel || 'system',
        });
      }
    }

    // Filter by action
    if (action) logs = logs.filter(l => l.action === action);

    // Filter by search
    if (search) {
      const s = search.toLowerCase();
      logs = logs.filter(l =>
        l.challanNumber?.toLowerCase().includes(s) ||
        l.company?.name?.toLowerCase().includes(s) ||
        l.party?.name?.toLowerCase().includes(s)
      );
    }

    // Sort by date desc
    logs.sort((a, b) => new Date(b.at) - new Date(a.at));

    const total = logs.length;
    const paginated = logs.slice(skip, skip + parseInt(limit));

    res.json({ success: true, data: paginated, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
};

export const getAuditLogStats = async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const challans = await Challan.find({ updatedAt: { $gte: since } });

    const stats = { total: 0, sent: 0, accepted: 0, rejected: 0, whatsapp: 0 };
    for (const challan of challans) {
      for (const trail of (challan.sfpTrail || [])) {
        if (new Date(trail.at) >= since) {
          stats.total++;
          if (trail.action === 'sent_to_party') stats.sent++;
          if (trail.action === 'accepted') stats.accepted++;
          if (trail.action === 'rejected') stats.rejected++;
          if (trail.channel === 'whatsapp') stats.whatsapp++;
        }
      }
    }

    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

// ── Usage Limits ──────────────────────────────────────────────────────────────
export const getUsageLimits = async (req, res, next) => {
  try {
    const companies = await Company.find({}).populate('owner', 'name email');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const data = await Promise.all(companies.map(async (company) => {
      const [userCount, challanCount] = await Promise.all([
        User.countDocuments({ company: company._id }),
        Challan.countDocuments({ company: company._id, createdAt: { $gte: startOfMonth } }),
      ]);

      const plan = PLANS[company.plan] || PLANS['free'];

      const current = {
        users: userCount,
        challansThisMonth: challanCount,
        invitesSentThisMonth: 0,
        storageUsedMb: 0,
        apiCallsToday: 0,
      };

      const limits = {
        maxUsers: plan.maxUsers || 10,
        maxChallansPerMonth: plan.maxChallans || 50,
        maxInvitesPerMonth: plan.maxInvites || 5,
        maxStorageMb: plan.maxStorage || 100,
        maxApiCallsPerDay: -1,
      };

      const percentages = {};
      for (const r of [
        { key: 'users', limitKey: 'maxUsers' },
        { key: 'challansThisMonth', limitKey: 'maxChallansPerMonth' },
      ]) {
        const lim = limits[r.limitKey];
        percentages[r.key] = lim === -1 ? 0 : Math.round((current[r.key] / lim) * 100);
      }

      return {
        company: { _id: company._id, name: company.name, plan: company.plan, owner: company.owner },
        current,
        limits,
        percentages,
        overrides: company.settings?.usageOverride || null,
      };
    }));

    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const getAtRiskCompanies = async (req, res, next) => {
  try {
    const companies = await Company.find({}).populate('owner', 'name email');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const atRisk = [];
    for (const company of companies) {
      const [userCount, challanCount] = await Promise.all([
        User.countDocuments({ company: company._id }),
        Challan.countDocuments({ company: company._id, createdAt: { $gte: startOfMonth } }),
      ]);
      const plan = PLANS[company.plan] || PLANS['free'];
      const maxChallans = plan.maxChallans || 50;
      const pct = maxChallans === -1 ? 0 : Math.round((challanCount / maxChallans) * 100);
      if (pct >= 80) {
        atRisk.push({
          company: { _id: company._id, name: company.name, plan: company.plan, owner: company.owner },
          current: { challansThisMonth: challanCount, users: userCount },
          limits: { maxChallansPerMonth: maxChallans },
          percentages: { challansThisMonth: pct },
        });
      }
    }

    res.json({ success: true, data: atRisk });
  } catch (error) { next(error); }
};

export const setUsageOverride = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { reason, expiresAt } = req.body;
    await Company.updateOne({ _id: companyId }, {
      'settings.usageOverride': { active: true, reason, expiresAt: expiresAt ? new Date(expiresAt) : null, grantedAt: new Date() }
    });
    res.json({ success: true, message: 'Override granted' });
  } catch (error) { next(error); }
};
