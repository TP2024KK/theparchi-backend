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
    }],
    barcodeEnabled: { type: Boolean, default: false },
    enablePaymentTracking: { type: Boolean, default: false },
    // Notification settings - Email
    notifyOnChallanSent: { type: Boolean, default: true },
    notifyOnChallanAccepted: { type: Boolean, default: true },
    notifyOnChallanRejected: { type: Boolean, default: true },
    notifyOnReturnChallan: { type: Boolean, default: true },
    notifyOnPaymentReceived: { type: Boolean, default: true },
    notifyOnNoteAdded: { type: Boolean, default: true },
    // Notification settings - WhatsApp
    notifyOnChallanSentWhatsApp: { type: Boolean, default: false },
    notifyOnChallanAcceptedWhatsApp: { type: Boolean, default: false },
    notifyOnChallanRejectedWhatsApp: { type: Boolean, default: false },
    notifyOnReturnChallanWhatsApp: { type: Boolean, default: false },
    notifyOnPaymentReceivedWhatsApp: { type: Boolean, default: false },
    notifyOnNoteAddedWhatsApp: { type: Boolean, default: false },
    // Multiple prefixes
    challanPrefixes: [{ label: String, prefix: String }],
  },

  subscription: {
    plan: { type: String, enum: ['free', 'starter', 'growth', 'enterprise'], default: 'free' },
    status: { type: String, enum: ['active', 'suspended', 'cancelled', 'trial'], default: 'active' },
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    nextBillingDate: Date,
    price: { type: Number, default: 0 },
  },

  limits: {
    maxUsers: { type: Number, default: 1 },
    maxChallansPerMonth: { type: Number, default: 25 },
    maxStorageMB: { type: Number, default: 100 },
  },

  usage: {
    currentUsers: { type: Number, default: 0 },
    challansThisMonth: { type: Number, default: 0 },
    storageMB: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now },
  },

  suspensionReason: String,
  registeredAt: { type: Date, default: Date.now },
  lastLoginAt: Date,

  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Company = mongoose.model('Company', companySchema);
export default Company;
