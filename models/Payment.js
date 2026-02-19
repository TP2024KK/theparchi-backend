import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  challan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challan',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  mode: {
    type: String,
    enum: ['cash', 'bank', 'upi', 'cheque', 'other'],
    required: true,
    default: 'cash'
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  reference: {
    type: String,
    trim: true
    // cheque number, UPI transaction ID, bank ref, etc.
  },
  notes: {
    type: String,
    trim: true
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

paymentSchema.index({ company: 1, challan: 1 });
paymentSchema.index({ company: 1, paymentDate: -1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
