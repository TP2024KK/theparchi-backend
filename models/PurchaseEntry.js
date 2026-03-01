import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema({
  // Link to inventory item (optional — can add new item on the fly)
  inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
  // Item details (copied at time of entry, or filled manually for new items)
  itemName: { type: String, required: true },
  sku: { type: String },
  unit: { type: String, default: 'pcs' },
  hsnCode: { type: String },
  // Quantities
  orderedQty: { type: Number, required: true, min: 0 },
  receivedQty: { type: Number, default: 0, min: 0 },  // filled on receive
  // Pricing
  unitPrice: { type: Number, default: 0 },
  gstRate: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  // For new items created on the fly
  isNewItem: { type: Boolean, default: false },
  newItemCategory: { type: String },
  newItemReorderPoint: { type: Number, default: 0 },
  newItemSellingPrice: { type: Number, default: 0 },
}, { _id: true });

const purchaseEntrySchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  // Auto-generated number
  purchaseNumber: { type: String, required: true },

  // Supplier info (free text — no separate Supplier model yet, Phase 3)
  supplierName: { type: String, trim: true },
  supplierPhone: { type: String, trim: true },
  supplierGST: { type: String, trim: true, uppercase: true },
  supplierInvoiceNumber: { type: String, trim: true }, // their invoice number

  // Dates
  purchaseDate: { type: Date, default: Date.now },
  expectedDelivery: { type: Date },

  // Warehouse where goods will be received
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },

  // Items ordered
  items: [purchaseItemSchema],

  // Totals
  subtotal: { type: Number, default: 0 },
  totalGST: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  totalReceivedValue: { type: Number, default: 0 },

  // Status flow:
  // draft → ordered → partially_received → received → cancelled
  status: {
    type: String,
    enum: ['draft', 'ordered', 'partially_received', 'received', 'cancelled'],
    default: 'draft'
  },

  // Payment
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'paid'],
    default: 'unpaid'
  },
  amountPaid: { type: Number, default: 0 },

  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receivedAt: { type: Date },

}, { timestamps: true });

// Indexes
purchaseEntrySchema.index({ company: 1, purchaseNumber: 1 }, { unique: true });
purchaseEntrySchema.index({ company: 1, status: 1 });
purchaseEntrySchema.index({ company: 1, purchaseDate: -1 });

const PurchaseEntry = mongoose.model('PurchaseEntry', purchaseEntrySchema);
export default PurchaseEntry;
