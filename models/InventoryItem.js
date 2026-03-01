import mongoose from 'mongoose';

// Sub-schema: stock per warehouse/location
const locationStockSchema = new mongoose.Schema({
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
  currentStock: { type: Number, default: 0, min: 0 },
  reservedStock: { type: Number, default: 0, min: 0 }, // reserved for pending orders (future)
}, { _id: false });

const inventoryItemSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  barcodeId: { type: String, sparse: true }, // for scanning

  category: { type: String, trim: true, default: '' },
  description: { type: String, trim: true },
  unit: { type: String, default: 'pcs' },
  hsnCode: { type: String, trim: true },
  gstRate: { type: Number, default: 0, enum: [0, 5, 12, 18, 28] },

  // ── Stock ─────────────────────────────────────────────────────────────────
  // currentStock = total across all warehouses (kept in sync as single source of truth)
  // locationStock = breakdown per warehouse/location
  currentStock: { type: Number, default: 0, min: 0 },
  locationStock: { type: [locationStockSchema], default: [] },

  // ── Batch Tracking (per-item toggle, requires global setting) ──────────────
  trackBatches: { type: Boolean, default: false },
  trackExpiry: { type: Boolean, default: false },

  // ── Reorder ───────────────────────────────────────────────────────────────
  reorderPoint: { type: Number, default: 0 },
  reorderQuantity: { type: Number, default: 0 },

  // ── Pricing ───────────────────────────────────────────────────────────────
  purchasePrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  avgPurchasePrice: { type: Number, default: 0 }, // weighted average (for valuation)
  lastPurchasePrice: { type: Number, default: 0 },

  notes: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
inventoryItemSchema.index({ company: 1, sku: 1 }, { unique: true });
inventoryItemSchema.index({ company: 1, name: 1 });
inventoryItemSchema.index({ company: 1, barcodeId: 1 }, { sparse: true });

// ── Virtuals ──────────────────────────────────────────────────────────────────
inventoryItemSchema.virtual('isLowStock').get(function () {
  return this.reorderPoint > 0 && this.currentStock <= this.reorderPoint;
});

// Sum of locationStock — should match currentStock
inventoryItemSchema.virtual('totalLocationStock').get(function () {
  return (this.locationStock || []).reduce((sum, ls) => sum + (ls.currentStock || 0), 0);
});

inventoryItemSchema.set('toJSON', { virtuals: true });
inventoryItemSchema.set('toObject', { virtuals: true });

// ── Instance method: sync currentStock from locationStock sum ─────────────────
inventoryItemSchema.methods.syncTotalStock = function () {
  if (!this.locationStock) this.locationStock = [];
  this.currentStock = this.locationStock.reduce((sum, ls) => sum + (ls.currentStock || 0), 0);
};

// ── Instance method: get or create locationStock entry for a warehouse/location
inventoryItemSchema.methods.getLocationEntry = function (warehouseId, locationId = null) {
  if (!this.locationStock) this.locationStock = [];
  const whStr = warehouseId?.toString();
  const locStr = locationId?.toString() || null;

  let entry = this.locationStock.find(ls => {
    const whMatch = ls.warehouse?.toString() === whStr;
    const locMatch = locStr
      ? ls.location?.toString() === locStr
      : !ls.location;
    return whMatch && locMatch;
  });

  if (!entry) {
    this.locationStock.push({
      warehouse: warehouseId,
      location: locationId || null,
      currentStock: 0,
      reservedStock: 0,
    });
    entry = this.locationStock[this.locationStock.length - 1];
  }

  return entry;
};

// ── Instance method: add stock to a specific warehouse/location ───────────────
inventoryItemSchema.methods.addToLocation = function (warehouseId, locationId, qty) {
  if (!this.locationStock) this.locationStock = [];
  const entry = this.getLocationEntry(warehouseId, locationId);
  entry.currentStock += Number(qty) || 0;
  this.syncTotalStock();
};

// ── Instance method: deduct stock from a specific warehouse/location ──────────
inventoryItemSchema.methods.deductFromLocation = function (warehouseId, locationId, qty) {
  const entry = this.getLocationEntry(warehouseId, locationId);
  if (entry.currentStock < qty) {
    throw new Error(`Insufficient stock at location. Available: ${entry.currentStock}, Required: ${qty}`);
  }
  entry.currentStock -= qty;
  this.syncTotalStock();
};

// ── Static: generate next SKU for this company ────────────────────────────────
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

// ── Static: generate barcodeId ────────────────────────────────────────────────
inventoryItemSchema.statics.generateBarcodeId = function (companyId, sku) {
  return `${companyId}-${sku}`;
};

const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);
export default InventoryItem;
