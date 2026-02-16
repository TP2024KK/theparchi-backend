import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema({
  originalChallan: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan' }, // which challan this item came from
  originalItem: { type: mongoose.Schema.Types.ObjectId }, // original item _id in that challan
  itemName: { type: String, required: true },
  hsn: String,
  description: String,
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'pcs' },
  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  gstRate: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  isNewItem: { type: Boolean, default: false }
});

const returnChallanSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  returnChallanNumber: { type: String, required: true, unique: true },
  originalChallan: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan' }, // primary challan (optional, for backward compat)
  party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
  returnDate: { type: Date, default: Date.now },
  items: [returnItemSchema],
  subtotal: { type: Number, default: 0 },
  totalGST: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  notes: String,
  returnType: {
    type: String,
    enum: ['party_return', 'self_return'],
    default: 'party_return'
  },
  status: {
    type: String,
    enum: ['pending', 'acknowledged'],
    default: 'pending'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const ReturnChallan = mongoose.model('ReturnChallan', returnChallanSchema);
export default ReturnChallan;
