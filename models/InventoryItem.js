import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
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
  sku: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  category: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true
  },
  unit: {
    type: String,
    default: 'pcs'
  },
  hsnCode: {
    type: String,
    trim: true
  },
  // Stock
  currentStock: {
    type: Number,
    default: 0,
    min: 0
  },
  // Reorder
  reorderPoint: {
    type: Number,
    default: 0
  },
  reorderQuantity: {
    type: Number,
    default: 0
  },
  // Pricing
  purchasePrice: {
    type: Number,
    default: 0
  },
  sellingPrice: {
    type: Number,
    default: 0
  },
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Indexes
inventoryItemSchema.index({ company: 1, sku: 1 }, { unique: true });
inventoryItemSchema.index({ company: 1, name: 1 });

// Virtual: isLowStock
inventoryItemSchema.virtual('isLowStock').get(function () {
  return this.reorderPoint > 0 && this.currentStock <= this.reorderPoint;
});

inventoryItemSchema.set('toJSON', { virtuals: true });
inventoryItemSchema.set('toObject', { virtuals: true });

// Static: generate next SKU for this company
inventoryItemSchema.statics.generateSKU = async function (companyId) {
  const year = new Date().getFullYear();
  const prefix = `TP-${year}-`;
  const last = await this.findOne(
    { company: companyId, sku: { $regex: `^${prefix}` } },
    {},
    { sort: { sku: -1 } }
  );
  let nextNum = 1;
  if (last) {
    const parts = last.sku.split('-');
    const lastNum = parseInt(parts[parts.length - 1]) || 0;
    nextNum = lastNum + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
};

const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);
export default InventoryItem;
