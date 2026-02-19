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
    line1: String,
    city: String,
    state: String,
    pincode: String
  },
  contactPerson: String,
  phone: String,
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

warehouseSchema.index({ company: 1, name: 1 }, { unique: true });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);
export default Warehouse;
