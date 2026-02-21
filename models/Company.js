import mongoose from 'mongoose';

const customColumnSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['text', 'number', 'date', 'dropdown', 'checkbox'], default: 'text' },
  options: [String],
  required: { type: Boolean, default: false },
}, { _id: true });

const challanTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  itemNameLabel: { type: String, default: 'Item Name' },
  hsnLabel: { type: String, default: 'HSN/SAC' },
  customColumns: { type: [customColumnSchema], default: [] },
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const companySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Company name is required'], trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  address: {
    line1: String, line2: String, city: String,
    state: String, pincode: String,
    country: { type: String, default: 'India' }
  },
  gstNumber: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },
  logo: { type: String },
  signature: { type: String },

  bankDetails: {
    accountName: String, accountNumber: String,
    ifscCode: String, bankName: String,
    branch: String, upiId: String
  },

  // Challan templates — up to 5
  challanTemplates: {
    type: [challanTemplateSchema],
    default: () => [{
      name: 'Default',
      itemNameLabel: 'Item Name',
      hsnLabel: 'HSN/SAC',
      customColumns: [],
      isDefault: true,
    }]
  },

  settings: {
    challanPrefix: { type: String, default: 'CH' },
    returnChallanPrefix: { type: String, default: 'RCH' },
    nextChallanNumber: { type: Number, default: 1 },
    nextReturnChallanNumber: { type: Number, default: 1 },
    defaultGST: { type: Number, default: 18 },
    documentHeading: { type: String, default: 'DELIVERY CHALLAN' },
    addressLabel: { type: String, default: 'BILL TO / DELIVER TO' },
    showGST: { type: Boolean, default: true },
    showBankDetails: { type: Boolean, default: false },
    showHSN: { type: Boolean, default: false },
    showSignature: { type: Boolean, default: false },
    signatureType: { type: String, enum: ['computer_generated', 'uploaded'], default: 'computer_generated' },
    termsAndConditions: { type: String, default: '' },
    showComputerGeneratedLine: { type: Boolean, default: true },
    partyPrefixRules: [{
      party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party' },
      prefix: String
    }]
  },

  subscription: {
    // Updated plan names: free / growth / pro
    plan: {
      type: String,
      enum: ['free', 'growth', 'pro'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'grace_period', 'suspended', 'cancelled', 'trial'],
      default: 'active',
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    startDate: { type: Date, default: Date.now },
    endDate: Date,                   // when current paid period ends
    nextBillingDate: Date,
    graceEndDate: Date,              // endDate + 7 days — read-only after this

    // Pricing snapshot at time of purchase (base, before GST)
    basePrice: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },

    // Payment gateway fields (Razorpay — keys added via super admin panel)
    razorpaySubscriptionId: String,
    razorpayCustomerId: String,
    lastPaymentId: String,
    lastPaymentDate: Date,
    lastPaymentStatus: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded'],
    },

    // Manual override by super admin
    manuallyManagedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    manualNote: String,
  },

  // Billing info — company fills this for GST invoice
  billingInfo: {
    legalName: String,
    gstNumber: String,
    address: {
      line1: String, line2: String, city: String,
      state: String, pincode: String,
    },
    wantsGstInvoice: { type: Boolean, default: false },
  },

  // Flat limits copied from plan at subscription time
  // Super admin can override these individually
  limits: {
    maxUsers: { type: Number, default: 1 },
    maxChallansPerMonth: { type: Number, default: 30 },
    maxStorageMB: { type: Number, default: 200 },
    maxParties: { type: Number, default: 20 },
    maxInventoryItems: { type: Number, default: 50 },
    maxWarehouses: { type: Number, default: 1 },
    maxTemplates: { type: Number, default: 1 },
  },

  // Running usage counters — reset monthly by cron
  usage: {
    currentUsers: { type: Number, default: 0 },
    challansThisMonth: { type: Number, default: 0 },
    storageMB: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now },
  },

  // WhatsApp credit wallet
  whatsapp: {
    credits: { type: Number, default: 0 },
    totalPurchased: { type: Number, default: 0 },
    totalUsed: { type: Number, default: 0 },
    lastPurchaseDate: Date,
  },

  suspensionReason: String,
  registeredAt: { type: Date, default: Date.now },
  lastLoginAt: Date,

  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
companySchema.index({ 'subscription.plan': 1 });
companySchema.index({ 'subscription.status': 1 });
companySchema.index({ 'subscription.endDate': 1 });

// ─── Virtual: is subscription currently usable ────────────────────────────────
companySchema.virtual('canOperate').get(function () {
  const s = this.subscription;
  if (s.plan === 'free') return true;
  if (s.status === 'active') return true;
  if (s.status === 'grace_period' && s.graceEndDate > new Date()) return true;
  return false;
});

// ─── Virtual: is in grace period ─────────────────────────────────────────────
companySchema.virtual('inGracePeriod').get(function () {
  const s = this.subscription;
  return s.status === 'grace_period' && s.graceEndDate > new Date();
});

const Company = mongoose.model('Company', companySchema);
export default Company;
