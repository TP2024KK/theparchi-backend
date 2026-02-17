import mongoose from 'mongoose';

const challanItemSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    default: 'pcs'
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    required: true
  },
  gstRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  gstAmount: {
    type: Number,
    default: 0
  },
  hsn: String,
  returnedQty: { type: Number, default: 0 },
  marginAccepted: {
    accepted: { type: Boolean, default: false },
    acceptedAt: Date,
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    comment: String,
    balanceQtyAtAcceptance: Number
  }
});

const challanSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  challanNumber: {
    type: String,
    required: true,
    unique: true
  },
  party: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  challanDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  items: [challanItemSchema],
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  totalGST: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    required: true,
    default: 0
  },
  notes: {
    type: String
  },
  status: {
    type: String,
    enum: [
      'draft',           // Saved, not submitted - fully editable
      'created',         // Submitted, not sent to party - editable by maker
      'sent',            // Sent to external party - not editable
      'rejected',        // Party rejected (never accepted) - editable, can resend
      'accepted',        // Party accepted
      'self_accepted',   // Owner/admin accepted own challan
      'returned',        // Fully returned after acceptance
      'partially_returned',      // Partially returned after acceptance
      'self_returned',           // Self returned after self_accepted
      'partially_self_returned', // Partially self returned
      'cancelled'
    ],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // SFP - Internal workflow
  sfpStatus: {
    type: String,
    enum: ['none', 'pending', 'viewed', 'sent'],
    default: 'none'
  },
  sfpAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sfpTrail: [{
    action: { type: String, enum: ['created', 'sfp_sent', 'sfp_viewed', 'sent_to_party', 'edited'] },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    at: { type: Date, default: Date.now }
  }],
  // Resend tracking (same challan number, updated content)
  resentCount: { type: Number, default: 0 },
  lastResentAt: Date,
  returnChallans: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReturnChallan'
  }],
  publicToken: {
    type: String,
    unique: true,
    sparse: true
  },
  partyOTP: {
    code: String,
    expiresAt: Date
  },
  partyResponse: {
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    respondedAt: Date,
    remarks: String,
    selfAction: { type: Boolean, default: false },
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  emailSentAt: Date,
  emailSentTo: String
}, {
  timestamps: true
});

// Index for faster queries
challanSchema.index({ company: 1, challanNumber: 1 });
challanSchema.index({ company: 1, party: 1 });
challanSchema.index({ company: 1, challanDate: -1 });

const Challan = mongoose.model('Challan', challanSchema);

export default Challan;
