import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Company name is required'], trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  address: {
    line1: String, line2: String, city: String,
    state: String, pincode: String,
    country: { type: String, default: 'India' }
  },
  gstNumber: {
    type: String, trim: true, uppercase: true
  },
  pan: { type: String, trim: true, uppercase: true },
  logo: { type: String }, // base64 or URL
  signature: { type: String }, // base64 PNG

  bankDetails: {
    accountName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    branch: String,
    upiId: String
  },

  settings: {
    // Challan numbering
    challanPrefix: { type: String, default: 'CH' },
    returnChallanPrefix: { type: String, default: 'RCH' },
    nextChallanNumber: { type: Number, default: 1 },
    nextReturnChallanNumber: { type: Number, default: 1 },
    defaultGST: { type: Number, default: 18 },

    // PDF Display Options
    documentHeading: { type: String, default: 'DELIVERY CHALLAN' },
    addressLabel: { type: String, default: 'BILL TO / DELIVER TO' },
    showGST: { type: Boolean, default: true },
    showBankDetails: { type: Boolean, default: false },
    showHSN: { type: Boolean, default: false },
    showSignature: { type: Boolean, default: false },
    signatureType: {
      type: String,
      enum: ['computer_generated', 'uploaded'],
      default: 'computer_generated'
    },
    // Party-specific challan prefix rules
    partyPrefixRules: [{
      party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party' },
      prefix: String
    }]
  },

  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Company = mongoose.model('Company', companySchema);
export default Company;
