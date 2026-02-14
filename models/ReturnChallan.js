import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  quantityReturned: {
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
    default: 0
  },
  gstAmount: {
    type: Number,
    default: 0
  },
  reason: {
    type: String,
    trim: true
  }
});

const returnChallanSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  returnChallanNumber: {
    type: String,
    required: true,
    unique: true
  },
  originalChallan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challan',
    required: true
  },
  party: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  returnDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  items: [returnItemSchema],
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
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
returnChallanSchema.index({ company: 1, returnChallanNumber: 1 });
returnChallanSchema.index({ company: 1, originalChallan: 1 });

const ReturnChallan = mongoose.model('ReturnChallan', returnChallanSchema);

export default ReturnChallan;
