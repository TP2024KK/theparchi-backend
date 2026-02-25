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

// ── Maintenance Scripts ───────────────────────────────────────────────────────
export const runMaintenanceScript = async (req, res, next) => {
  try {
    const { scriptId } = req.params;

    if (scriptId === 'fix_company_codes') {
      const result = await fixCompanyCodes();
      return res.json(result);
    }
    if (scriptId === 'fix_challan_prefixes') {
      const result = await fixChallanPrefixes();
      return res.json(result);
    }
    if (scriptId === 'fix_return_prefixes') {
      const result = await fixReturnPrefixes();
      return res.json(result);
    }
    if (scriptId === 'fix_all_legacy') {
      const r1 = await fixCompanyCodes();
      const r2 = await fixChallanPrefixes();
      const r3 = await fixReturnPrefixes();
      const details = [...r1.details, ...r2.details, ...r3.details];
      return res.json({
        success: true,
        message: `All legacy fixes complete. ${details.length} updates made across all scripts.`,
        details
      });
    }

    return res.status(400).json({ success: false, message: 'Unknown script ID' });
  } catch (error) { next(error); }
};

// ── Helper: generate unique prefix from company name + id ────────────────────
function generatePrefix(name, id) {
  const idSuffix = id.toString().slice(-3).toUpperCase();
  const initials = (name || 'CO')
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .join('')
    .slice(0, 4) || 'CO';
  return `${initials}${idSuffix}`;
}

// ── Script 1: Fix Company Codes ───────────────────────────────────────────────
async function fixCompanyCodes() {
  const companies = await Company.find({ $or: [{ companyCode: { $exists: false } }, { companyCode: null }, { companyCode: '' }] });
  if (companies.length === 0) {
    return { success: true, message: 'All companies already have company codes. Nothing to update.', details: [] };
  }

  const details = [];
  for (const company of companies) {
    let code = generatePrefix(company.name, company._id);
    // Ensure uniqueness
    let exists = await Company.findOne({ companyCode: code, _id: { $ne: company._id } });
    let attempts = 0;
    while (exists && attempts < 10) {
      code = `${code.slice(0, -1)}${attempts}`;
      exists = await Company.findOne({ companyCode: code, _id: { $ne: company._id } });
      attempts++;
    }
    await Company.updateOne({ _id: company._id }, { $set: { companyCode: code } });
    details.push(`${company.name} → code: ${code}`);
  }

  return {
    success: true,
    message: `Company codes generated for ${details.length} companies.`,
    details
  };
}

// ── Script 2: Fix Challan Prefixes ────────────────────────────────────────────
async function fixChallanPrefixes() {
  const companies = await Company.find({
    $or: [
      { 'settings.challanPrefix': 'CH' },
      { 'settings.challanPrefix': { $exists: false } },
      { 'settings.challanPrefix': null },
      { 'settings.challanPrefix': '' }
    ]
  });
  if (companies.length === 0) {
    return { success: true, message: 'All companies already have unique challan prefixes. Nothing to update.', details: [] };
  }

  const details = [];
  for (const company of companies) {
    const prefix = generatePrefix(company.name, company._id);
    await Company.updateOne({ _id: company._id }, { $set: { 'settings.challanPrefix': prefix } });
    details.push(`${company.name} → prefix: ${prefix}`);
  }

  return {
    success: true,
    message: `Challan prefixes fixed for ${details.length} companies.`,
    details
  };
}

// ── Script 3: Fix Return Prefixes ─────────────────────────────────────────────
async function fixReturnPrefixes() {
  const companies = await Company.find({
    $or: [
      { 'settings.returnChallanPrefix': 'RCH' },
      { 'settings.returnChallanPrefix': { $exists: false } },
      { 'settings.returnChallanPrefix': null },
      { 'settings.returnChallanPrefix': '' }
    ]
  });
  if (companies.length === 0) {
    return { success: true, message: 'All companies already have unique return prefixes. Nothing to update.', details: [] };
  }

  const details = [];
  for (const company of companies) {
    const prefix = generatePrefix(company.name, company._id) + 'R';
    await Company.updateOne({ _id: company._id }, { $set: { 'settings.returnChallanPrefix': prefix } });
    details.push(`${company.name} → return prefix: ${prefix}`);
  }

  return {
    success: true,
    message: `Return prefixes fixed for ${details.length} companies.`,
    details
  };
}
