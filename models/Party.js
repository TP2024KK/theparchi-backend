import mongoose from 'mongoose';

const partySchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Party name is required'],
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
    uppercase: true
  },
  type: {
    type: String,
    enum: ['customer', 'supplier', 'both'],
    default: 'customer'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String
  },
  challanTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
partySchema.index({ company: 1, name: 1 });

const Party = mongoose.model('Party', partySchema);

export default Party;
