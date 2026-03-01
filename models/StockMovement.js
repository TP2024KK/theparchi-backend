import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
  batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },

  type: { type: String, enum: ['IN', 'OUT'], required: true },
  reason: {
    type: String,
    enum: [
      'purchase', 'production', 'return_received',
      'challan_sent', 'sale', 'wastage', 'adjustment',
      'transfer_in', 'transfer_out', 'opening_stock',
      'manual_in', 'manual_out'
    ],
    required: true
  },

  quantity: { type: Number, required: true },
  beforeQty: { type: Number, required: true },
  afterQty: { type: Number, required: true },

  unitPrice: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },

  relatedChallan: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan', default: null },
  relatedReturnChallan: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnChallan', default: null },

  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String, trim: true },
  movementDate: { type: Date, default: Date.now }
}, { timestamps: true });

stockMovementSchema.index({ company: 1, item: 1, movementDate: -1 });
stockMovementSchema.index({ company: 1, warehouse: 1, movementDate: -1 });
stockMovementSchema.index({ company: 1, relatedChallan: 1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
