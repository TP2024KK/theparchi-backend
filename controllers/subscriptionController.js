import Company from '../models/Company.js';
import Invoice from '../models/Invoice.js';
import { PLANS, WHATSAPP_PACKS, calculateGST } from '../config/plans.js';
import { activateSubscription, addWhatsAppCredits } from '../services/subscription.service.js';
import { createRazorpayOrder, verifyRazorpaySignature, verifyWebhookSignature } from '../services/razorpay.service.js';

// ─── GET /api/subscription/plans — public, no auth needed ────────────────────
export const getPlans = async (req, res) => {
  try {
    // Return plans without internal cost fields
    const plans = Object.entries(PLANS).map(([key, p]) => ({
      key,
      name: p.name,
      monthlyPrice: p.monthlyPrice,
      yearlyPrice: p.yearlyPrice,
      yearlyMonthlyEquivalent: p.yearlyMonthlyEquivalent,
      color: p.color,
      description: p.description,
      limits: p.limits,
      features: p.features,
      badge: p.badge,
    }));

    const packs = Object.entries(WHATSAPP_PACKS).map(([key, p]) => ({
      key,
      name: p.name,
      credits: p.credits,
      price: p.price,
      pricePerCredit: p.pricePerCredit,
      badge: p.badge,
    }));

    res.json({ success: true, data: { plans, packs, gstRate: 18 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/subscription/status — current company subscription ──────────────
export const getStatus = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company)
      .select('subscription limits usage whatsapp billingInfo name email')
      .lean();

    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const plan = PLANS[company.subscription?.plan] || PLANS.free;

    res.json({
      success: true,
      data: {
        subscription: company.subscription,
        limits: company.limits,
        usage: company.usage,
        whatsapp: company.whatsapp,
        billingInfo: company.billingInfo,
        planConfig: {
          name: plan.name,
          color: plan.color,
          features: plan.features,
          monthlyPrice: plan.monthlyPrice,
          yearlyPrice: plan.yearlyPrice,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/subscription/create-order — step 1: create Razorpay order ──────
export const createOrder = async (req, res) => {
  try {
    const { plan, billingCycle } = req.body;

    if (!PLANS[plan] || plan === 'free') {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    const planConfig = PLANS[plan];
    const isYearly = billingCycle === 'yearly';
    const baseAmount = isYearly ? planConfig.yearlyPrice : planConfig.monthlyPrice;
    const { gst, total } = calculateGST(baseAmount);

    const order = await createRazorpayOrder({
      amount: total,
      receipt: `sub_${req.user.company}_${Date.now()}`,
      notes: {
        companyId: String(req.user.company),
        plan,
        billingCycle,
        baseAmount,
        gstAmount: gst,
      },
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: total,       // total including GST (in INR, Razorpay will get paise)
        baseAmount,
        gstAmount: gst,
        currency: 'INR',
        plan,
        billingCycle,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/subscription/verify-payment — step 2: verify & activate ────────
export const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, plan, billingCycle } = req.body;

    // Verify signature
    const isValid = await verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Payment verification failed. Please contact support.' });
    }

    const { company, invoice } = await activateSubscription({
      companyId: req.user.company,
      plan,
      billingCycle,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    });

    res.json({
      success: true,
      message: `${PLANS[plan].name} plan activated successfully!`,
      data: { subscription: company.subscription, invoice: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount } },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/subscription/create-whatsapp-order ────────────────────────────
export const createWhatsAppOrder = async (req, res) => {
  try {
    const { pack } = req.body;
    const packConfig = WHATSAPP_PACKS[pack];
    if (!packConfig) return res.status(400).json({ success: false, message: 'Invalid pack' });

    const { gst, total } = calculateGST(packConfig.price);

    const order = await createRazorpayOrder({
      amount: total,
      receipt: `wa_${req.user.company}_${Date.now()}`,
      notes: {
        companyId: String(req.user.company),
        type: 'whatsapp_credits',
        pack,
        credits: packConfig.credits,
      },
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: total,
        baseAmount: packConfig.price,
        gstAmount: gst,
        credits: packConfig.credits,
        pack,
        currency: 'INR',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/subscription/verify-whatsapp-payment ──────────────────────────
export const verifyWhatsAppPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, pack } = req.body;

    const isValid = await verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    const { invoice, totalCredits, bonusCredits } = await addWhatsAppCredits({
      companyId: req.user.company,
      pack,
      razorpayPaymentId,
      razorpayOrderId,
    });

    res.json({
      success: true,
      message: `${totalCredits} WhatsApp credits added!${bonusCredits > 0 ? ` (includes ${bonusCredits} bonus credits for Pro plan)` : ''}`,
      data: { totalCredits, bonusCredits, invoice: { invoiceNumber: invoice.invoiceNumber } },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/subscription/webhook — Razorpay webhook ───────────────────────
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValid = await verifyWebhookSignature(req.rawBody, signature);

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body;

    if (event.event === 'payment.failed') {
      const notes = event.payload?.payment?.entity?.notes || {};
      if (notes.companyId) {
        await Company.findByIdAndUpdate(notes.companyId, {
          'subscription.lastPaymentStatus': 'failed',
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/subscription/invoices — company's invoice history ───────────────
export const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ company: req.user.company })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/subscription/billing-info — save GST billing details ────────────
export const updateBillingInfo = async (req, res) => {
  try {
    const { legalName, gstNumber, address, wantsGstInvoice } = req.body;
    await Company.findByIdAndUpdate(req.user.company, {
      billingInfo: { legalName, gstNumber, address, wantsGstInvoice },
    });
    res.json({ success: true, message: 'Billing info updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
