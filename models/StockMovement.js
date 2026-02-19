import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true
  },
  type: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  reason: {
    type: String,
    enum: [
      'opening_stock',
      'purchase',
      'return_received',
      'challan_sent',
      'wastage',
      'adjustment',
      'manual_in',
      'manual_out'
    ],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  beforeQty: {
    type: Number,
    required: true
  },
  afterQty: {
    type: Number,
    required: true
  },
  unitPrice: {
    type: Number,
    default: 0
  },
  totalValue: {
    type: Number,
    default: 0
  },
  // References
  relatedChallan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challan'
  },
  relatedReturnChallan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReturnChallan'
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,
  movementDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

stockMovementSchema.index({ company: 1, item: 1, movementDate: -1 });
stockMovementSchema.index({ company: 1, relatedChallan: 1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
