import Company from '../models/Company.js';
import Invoice from '../models/Invoice.js';
import { PLANS, WHATSAPP_PACKS, calculateGST, getPlanLimits } from '../config/plans.js';
import { sendSubscriptionEmail } from '../utils/subscriptionEmail.js';

// ─── Activate / upgrade a subscription ───────────────────────────────────────

export const activateSubscription = async ({
  companyId,
  plan,
  billingCycle,
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
  markedManuallyBy = null,
  manualNote = null,
}) => {
  const company = await Company.findById(companyId);
  if (!company) throw new Error('Company not found');

  const planConfig = PLANS[plan];
  if (!planConfig) throw new Error('Invalid plan');

  const isYearly = billingCycle === 'yearly';
  const basePrice = isYearly ? planConfig.yearlyPrice : planConfig.monthlyPrice;
  const { gst, total } = calculateGST(basePrice);

  const now = new Date();
  const endDate = new Date(now);
  if (isYearly) {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  const graceEndDate = new Date(endDate);
  graceEndDate.setDate(graceEndDate.getDate() + planConfig.features.graceperiodDays);

  const limits = getPlanLimits(plan);

  // Update company
  company.subscription = {
    plan,
    status: 'active',
    billingCycle,
    startDate: now,
    endDate,
    nextBillingDate: endDate,
    graceEndDate,
    basePrice,
    gstAmount: gst,
    totalPrice: total,
    razorpayPaymentId: razorpayPaymentId || company.subscription.razorpayPaymentId,
    lastPaymentId: razorpayPaymentId,
    lastPaymentDate: now,
    lastPaymentStatus: 'success',
    manuallyManagedBy: markedManuallyBy,
    manualNote,
  };

  // Sync limits from plan
  company.limits = {
    maxUsers: limits.maxUsers,
    maxChallansPerMonth: limits.maxChallansPerMonth,
    maxStorageMB: limits.maxStorageMB,
    maxParties: limits.maxParties,
    maxInventoryItems: limits.maxInventoryItems,
    maxWarehouses: limits.maxWarehouses,
    maxTemplates: limits.maxTemplates,
  };

  await company.save();

  // Create invoice
  const invoice = await Invoice.create({
    company: companyId,
    billingSnapshot: {
      companyName: company.name,
      legalName: company.billingInfo?.legalName || company.name,
      gstNumber: company.billingInfo?.gstNumber || company.gstNumber,
      email: company.email,
    },
    type: 'subscription',
    plan,
    billingCycle,
    periodStart: now,
    periodEnd: endDate,
    baseAmount: basePrice,
    gstAmount: gst,
    totalAmount: total,
    paymentStatus: 'paid',
    paymentMethod: markedManuallyBy ? 'manual' : 'razorpay',
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    paidAt: now,
    markedPaidBy: markedManuallyBy,
    markedPaidNote: manualNote,
  });

  // Send email
  try {
    await sendSubscriptionEmail(company, plan, billingCycle, invoice);
  } catch (e) {
    console.error('[Subscription] Email failed:', e.message);
  }

  return { company, invoice };
};

// ─── Cancel / downgrade to free ──────────────────────────────────────────────

export const cancelSubscription = async (companyId, reason = '') => {
  const company = await Company.findById(companyId);
  if (!company) throw new Error('Company not found');

  company.subscription.status = 'cancelled';
  company.suspensionReason = reason;

  // Downgrade limits to free
  const freeLimits = getPlanLimits('free');
  company.limits = { ...freeLimits };

  await company.save();
  return company;
};

// ─── Start grace period (called by expiry cron) ───────────────────────────────

export const startGracePeriod = async (company) => {
  const graceEnd = new Date(company.subscription.endDate);
  graceEnd.setDate(graceEnd.getDate() + 7);

  company.subscription.status = 'grace_period';
  company.subscription.graceEndDate = graceEnd;
  await company.save();

  try {
    await sendSubscriptionEmail(company, company.subscription.plan, company.subscription.billingCycle, null, 'grace_period');
  } catch (e) {
    console.error('[Subscription] Grace period email failed:', e.message);
  }
};

// ─── Suspend after grace period expires ──────────────────────────────────────

export const suspendExpired = async (company) => {
  company.subscription.status = 'suspended';
  company.subscription.plan = 'free';
  company.limits = { ...getPlanLimits('free') };
  await company.save();

  try {
    await sendSubscriptionEmail(company, 'free', null, null, 'suspended');
  } catch (e) {
    console.error('[Subscription] Suspension email failed:', e.message);
  }
};

// ─── Add WhatsApp credits ─────────────────────────────────────────────────────

export const addWhatsAppCredits = async ({
  companyId,
  pack,
  razorpayPaymentId,
  razorpayOrderId,
  markedManuallyBy = null,
}) => {
  const company = await Company.findById(companyId);
  if (!company) throw new Error('Company not found');

  const packConfig = WHATSAPP_PACKS[pack];
  if (!packConfig) throw new Error('Invalid WhatsApp pack');

  // Pro plan gets 10% bonus credits
  const isPro = company.subscription.plan === 'pro';
  const bonusPct = isPro ? 0.10 : 0;
  const bonusCredits = Math.floor(packConfig.credits * bonusPct);
  const totalCredits = packConfig.credits + bonusCredits;

  const { gst, total } = calculateGST(packConfig.price);

  company.whatsapp.credits += totalCredits;
  company.whatsapp.totalPurchased += totalCredits;
  company.whatsapp.lastPurchaseDate = new Date();
  await company.save();

  const invoice = await Invoice.create({
    company: companyId,
    billingSnapshot: {
      companyName: company.name,
      legalName: company.billingInfo?.legalName || company.name,
      gstNumber: company.billingInfo?.gstNumber || company.gstNumber,
      email: company.email,
    },
    type: 'whatsapp_credits',
    whatsappPack: pack,
    whatsappCredits: totalCredits,
    baseAmount: packConfig.price,
    gstAmount: gst,
    totalAmount: total,
    paymentStatus: 'paid',
    paymentMethod: markedManuallyBy ? 'manual' : 'razorpay',
    razorpayOrderId,
    razorpayPaymentId,
    paidAt: new Date(),
    markedPaidBy: markedManuallyBy,
  });

  return { company, invoice, bonusCredits, totalCredits };
};

// ─── Expiry cron — run daily ──────────────────────────────────────────────────

export const runExpiryCheck = async () => {
  const now = new Date();

  // 1. Active subscriptions that have passed endDate → grace period
  const expiredActive = await Company.find({
    'subscription.status': 'active',
    'subscription.plan': { $ne: 'free' },
    'subscription.endDate': { $lt: now },
  });

  for (const company of expiredActive) {
    await startGracePeriod(company);
    console.log(`[Subscription] Grace period started: ${company.name}`);
  }

  // 2. Grace period companies whose grace has ended → suspend
  const expiredGrace = await Company.find({
    'subscription.status': 'grace_period',
    'subscription.graceEndDate': { $lt: now },
  });

  for (const company of expiredGrace) {
    await suspendExpired(company);
    console.log(`[Subscription] Suspended: ${company.name}`);
  }

  // 3. Send renewal reminder 3 days before expiry
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);

  const renewalReminders = await Company.find({
    'subscription.status': 'active',
    'subscription.plan': { $ne: 'free' },
    'subscription.endDate': { $gte: now, $lte: in3Days },
  });

  for (const company of renewalReminders) {
    try {
      await sendSubscriptionEmail(company, company.subscription.plan, company.subscription.billingCycle, null, 'renewal_reminder');
    } catch (e) {
      console.error('[Subscription] Reminder email failed:', e.message);
    }
  }

  return {
    gracePeriodStarted: expiredActive.length,
    suspended: expiredGrace.length,
    remindersSent: renewalReminders.length,
  };
};
