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
    enum: ['draft', 'sent', 'returned', 'cancelled'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  returnChallans: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReturnChallan'
  }]
}, {
  timestamps: true
});

// Index for faster queries
challanSchema.index({ company: 1, challanNumber: 1 });
challanSchema.index({ company: 1, party: 1 });
challanSchema.index({ company: 1, challanDate: -1 });

const Challan = mongoose.model('Challan', challanSchema);

export default Challan;
