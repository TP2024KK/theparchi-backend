import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  gstNumber: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number format']
  },
  pan: {
    type: String,
    trim: true,
    uppercase: true
  },
  logo: {
    type: String // URL or base64
  },
  bankDetails: {
    accountName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    branch: String
  },
  settings: {
    challanPrefix: {
      type: String,
      default: 'CH'
    },
    returnChallanPrefix: {
      type: String,
      default: 'RCH'
    },
    nextChallanNumber: {
      type: Number,
      default: 1
    },
    nextReturnChallanNumber: {
      type: Number,
      default: 1
    },
    defaultGST: {
      type: Number,
      default: 18
    }
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const Company = mongoose.model('Company', companySchema);

export default Company;
