import mongoose from 'mongoose';

const warehouseSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    trim: true,
    uppercase: true
  },
  address: {
    line1: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true }
  },
  contactPerson: { type: String, trim: true },
  phone: { type: String, trim: true },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  notes: { type: String, trim: true }
}, { timestamps: true });

warehouseSchema.index({ company: 1, name: 1 }, { unique: true });
warehouseSchema.index({ company: 1, isDefault: 1 });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);
export default Warehouse;
