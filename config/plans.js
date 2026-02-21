// ─── TheParchi Subscription Plans ────────────────────────────────────────────
// GST (18%) is charged EXTRA on top of these prices at billing time.
// Prices shown to users are base prices. Invoice shows base + GST separately.

export const PLANS = {
  free: {
    name: 'Free',
    displayName: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyMonthlyEquivalent: 0, // per month when billed yearly
    color: '#6B7280',
    description: 'Perfect for trying out TheParchi',
    limits: {
      maxUsers: 1,
      maxChallansPerMonth: 30,
      maxStorageMB: 200,
      maxParties: 20,
      maxInventoryItems: 50,
      maxWarehouses: 1,
      maxTemplates: 1,
    },
    features: {
      senderPanel: true,
      receiverPanel: true,         // always free
      emailNotifications: true,    // always free
      whatsappCredits: true,       // can buy credits on any plan
      customPdfLogo: false,
      bulkOperations: false,
      advancedInventory: false,
      barcodeQr: false,
      apiAccess: false,
      prioritySupport: false,
      graceperiodDays: 0,
    },
    badge: null,
  },

  growth: {
    name: 'Growth',
    displayName: 'Growth',
    monthlyPrice: 599,
    yearlyPrice: 5990,             // saves ₹1,198 (2 months free)
    yearlyMonthlyEquivalent: 499,
    color: '#6C5CE7',
    description: 'For growing businesses',
    limits: {
      maxUsers: 8,
      maxChallansPerMonth: -1,     // unlimited
      maxStorageMB: 5120,          // 5GB
      maxParties: -1,
      maxInventoryItems: -1,
      maxWarehouses: 3,
      maxTemplates: 5,
    },
    features: {
      senderPanel: true,
      receiverPanel: true,
      emailNotifications: true,
      whatsappCredits: true,
      customPdfLogo: true,
      bulkOperations: true,
      advancedInventory: false,
      barcodeQr: false,
      apiAccess: false,
      prioritySupport: false,
      graceperiodDays: 7,
    },
    badge: 'Popular',
  },

  pro: {
    name: 'Pro',
    displayName: 'Pro',
    monthlyPrice: 1499,
    yearlyPrice: 14990,            // saves ₹2,998 (2 months free)
    yearlyMonthlyEquivalent: 1249,
    color: '#FF6B6B',
    description: 'For established businesses',
    limits: {
      maxUsers: 25,
      maxChallansPerMonth: -1,
      maxStorageMB: 20480,         // 20GB
      maxParties: -1,
      maxInventoryItems: -1,
      maxWarehouses: -1,
      maxTemplates: -1,
    },
    features: {
      senderPanel: true,
      receiverPanel: true,
      emailNotifications: true,
      whatsappCredits: true,
      whatsappCreditBonus: 10,     // 10% bonus credits on purchase
      customPdfLogo: true,
      bulkOperations: true,
      advancedInventory: true,
      barcodeQr: true,             // subject to super admin activation
      apiAccess: true,
      prioritySupport: true,
      graceperiodDays: 7,
    },
    badge: 'Best Value',
  },
};

// ─── WhatsApp Credit Packs ────────────────────────────────────────────────────
// Available to ALL plans. Credits = conversations (Meta charges per 24hr window).
// Our cost: ~₹0.13 per conversation (Meta rate for utility messages)

export const WHATSAPP_PACKS = {
  trial: {
    name: 'Trial Pack',
    credits: 50,
    price: 49,
    pricePerCredit: 0.98,
    badge: null,
  },
  starter: {
    name: 'Starter Pack',
    credits: 200,
    price: 169,
    pricePerCredit: 0.845,
    badge: null,
  },
  popular: {
    name: 'Popular Pack',
    credits: 500,
    price: 399,
    pricePerCredit: 0.798,
    badge: 'Popular',
  },
  business: {
    name: 'Business Pack',
    credits: 2000,
    price: 1499,
    pricePerCredit: 0.7495,
    badge: 'Best Value',
  },
};

// ─── GST Rate ─────────────────────────────────────────────────────────────────
export const GST_RATE = 0.18; // 18%

// ─── Helper: get plan limits ──────────────────────────────────────────────────
export const getPlanLimits = (planName) => {
  const plan = PLANS[planName] || PLANS.free;
  return plan.limits;
};

// ─── Helper: get plan features ───────────────────────────────────────────────
export const getPlanFeatures = (planName) => {
  const plan = PLANS[planName] || PLANS.free;
  return plan.features;
};

// ─── Helper: calculate GST ───────────────────────────────────────────────────
export const calculateGST = (baseAmount) => ({
  base: baseAmount,
  gst: Math.round(baseAmount * GST_RATE),
  total: Math.round(baseAmount * (1 + GST_RATE)),
});
