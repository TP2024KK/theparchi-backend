import InventoryItem from '../models/InventoryItem.js';
import StockMovement from '../models/StockMovement.js';
import Warehouse from '../models/Warehouse.js';

// Helper: ensure default warehouse exists
const ensureDefaultWarehouse = async (companyId) => {
  let warehouse = await Warehouse.findOne({ company: companyId, isDefault: true, isActive: true });
  if (!warehouse) {
    warehouse = await Warehouse.findOne({ company: companyId, isActive: true });
    if (!warehouse) {
      warehouse = await Warehouse.create({
        company: companyId,
        name: 'Main Warehouse',
        code: 'WH1',
        isDefault: true,
        isActive: true
      });
    }
  }
  return warehouse;
};

// GET /api/inventory
export const getInventoryItems = async (req, res, next) => {
  try {
    const { search, category, lowStock } = req.query;
    const query = { company: req.user.company, isActive: true };
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    const items = await InventoryItem.find(query).sort({ name: 1 });

    let result = items;
    if (lowStock === 'true') {
      result = items.filter(i => i.reorderPoint > 0 && i.currentStock <= i.reorderPoint);
    }

    res.json({ success: true, data: result, count: result.length });
  } catch (error) { next(error); }
};

// GET /api/inventory/search  (for challan item picker)
export const searchInventoryItems = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json({ success: true, data: [] });

    const items = await InventoryItem.find({
      company: req.user.company,
      isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } }
      ]
    }).limit(10).select('name sku unit currentStock sellingPrice purchasePrice hsnCode');

    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};

// GET /api/inventory/:id
export const getInventoryItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findOne({ _id: req.params.id, company: req.user.company });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};

// GET /api/inventory/:id/movements
export const getItemMovements = async (req, res, next) => {
  try {
    const movements = await StockMovement.find({
      company: req.user.company,
      item: req.params.id
    })
      .populate('performedBy', 'name')
      .populate('relatedChallan', 'challanNumber')
      .sort({ movementDate: -1 })
      .limit(50);
    res.json({ success: true, data: movements });
  } catch (error) { next(error); }
};

// POST /api/inventory
export const createInventoryItem = async (req, res, next) => {
  try {
    const {
      name, sku: customSku, category, description, unit, hsnCode,
      reorderPoint, reorderQuantity, purchasePrice, sellingPrice,
      openingStock, notes
    } = req.body;

    // Generate or use custom SKU
    const sku = customSku?.trim()
      ? customSku.trim().toUpperCase()
      : await InventoryItem.generateSKU(req.user.company);

    // Check duplicate SKU
    const existing = await InventoryItem.findOne({ company: req.user.company, sku });
    if (existing) return res.status(400).json({ success: false, message: `SKU "${sku}" already exists` });

    const item = await InventoryItem.create({
      company: req.user.company,
      name, sku, category, description, unit: unit || 'pcs',
      hsnCode, reorderPoint: reorderPoint || 0,
      reorderQuantity: reorderQuantity || 0,
      purchasePrice: purchasePrice || 0,
      sellingPrice: sellingPrice || 0,
      currentStock: 0,
      notes
    });

    // Add opening stock movement if provided
    if (openingStock && openingStock > 0) {
      await ensureDefaultWarehouse(req.user.company);
      await StockMovement.create({
        company: req.user.company,
        item: item._id,
        type: 'IN',
        reason: 'opening_stock',
        quantity: openingStock,
        beforeQty: 0,
        afterQty: openingStock,
        unitPrice: purchasePrice || 0,
        totalValue: (purchasePrice || 0) * openingStock,
        performedBy: req.user.id,
        notes: 'Opening stock'
      });
      item.currentStock = openingStock;
      await item.save();
    }

    res.status(201).json({ success: true, message: 'Item created!', data: item });
  } catch (error) { next(error); }
};

// PUT /api/inventory/:id
export const updateInventoryItem = async (req, res, next) => {
  try {
    const {
      name, category, description, unit, hsnCode,
      reorderPoint, reorderQuantity, purchasePrice, sellingPrice, notes
    } = req.body;

    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { name, category, description, unit, hsnCode, reorderPoint, reorderQuantity, purchasePrice, sellingPrice, notes },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item updated!', data: item });
  } catch (error) { next(error); }
};

// DELETE /api/inventory/:id
export const deleteInventoryItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) { next(error); }
};

// POST /api/inventory/:id/adjust  (manual stock adjustment)
export const adjustStock = async (req, res, next) => {
  try {
    const { type, quantity, reason, notes, unitPrice } = req.body;
    // type: 'IN' | 'OUT', reason: string, quantity: number

    if (!['IN', 'OUT'].includes(type)) return res.status(400).json({ success: false, message: 'Type must be IN or OUT' });
    if (!quantity || quantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be > 0' });

    const item = await InventoryItem.findOne({ _id: req.params.id, company: req.user.company });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (type === 'OUT' && item.currentStock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${item.currentStock}, Requested: ${quantity}`
      });
    }

    const beforeQty = item.currentStock;
    item.currentStock = type === 'IN' ? beforeQty + quantity : beforeQty - quantity;
    await item.save();

    await StockMovement.create({
      company: req.user.company,
      item: item._id,
      type,
      reason: reason || (type === 'IN' ? 'manual_in' : 'manual_out'),
      quantity,
      beforeQty,
      afterQty: item.currentStock,
      unitPrice: unitPrice || item.purchasePrice || 0,
      totalValue: (unitPrice || item.purchasePrice || 0) * quantity,
      performedBy: req.user.id,
      notes
    });

    res.json({ success: true, message: `Stock ${type === 'IN' ? 'added' : 'removed'} successfully!`, data: item });
  } catch (error) { next(error); }
};

// Called internally when challan is sent — deduct stock for inventory-linked items
export const deductStockForChallan = async ({ companyId, userId, challanId, items }) => {
  for (const item of items) {
    if (!item.inventoryItemId) continue; // skip non-inventory items
    try {
      const invItem = await InventoryItem.findOne({ _id: item.inventoryItemId, company: companyId });
      if (!invItem) continue;

      const qty = item.quantity || 0;
      if (qty <= 0) continue;
      if (invItem.currentStock < qty) continue; // soft — don't block, just skip

      const beforeQty = invItem.currentStock;
      invItem.currentStock -= qty;
      await invItem.save();

      await StockMovement.create({
        company: companyId,
        item: invItem._id,
        type: 'OUT',
        reason: 'challan_sent',
        quantity: qty,
        beforeQty,
        afterQty: invItem.currentStock,
        unitPrice: item.rate || 0,
        totalValue: (item.rate || 0) * qty,
        relatedChallan: challanId,
        performedBy: userId,
        notes: `Auto-deducted for challan`
      });
    } catch (err) {
      console.error('Stock deduction error for item:', item.inventoryItemId, err.message);
    }
  }
};

// Called internally when return challan received — add stock back
export const addStockForReturn = async ({ companyId, userId, returnChallanId, items }) => {
  for (const item of items) {
    if (!item.inventoryItemId) continue;
    try {
      const invItem = await InventoryItem.findOne({ _id: item.inventoryItemId, company: companyId });
      if (!invItem) continue;

      const qty = item.returnedQty || item.quantity || 0;
      if (qty <= 0) continue;

      const beforeQty = invItem.currentStock;
      invItem.currentStock += qty;
      await invItem.save();

      await StockMovement.create({
        company: companyId,
        item: invItem._id,
        type: 'IN',
        reason: 'return_received',
        quantity: qty,
        beforeQty,
        afterQty: invItem.currentStock,
        unitPrice: item.rate || 0,
        totalValue: (item.rate || 0) * qty,
        relatedReturnChallan: returnChallanId,
        performedBy: userId,
        notes: `Auto-added from return challan`
      });
    } catch (err) {
      console.error('Stock return error for item:', item.inventoryItemId, err.message);
    }
  }
};


// @desc  Download sample CSV template for bulk upload
// @route GET /api/inventory/bulk-template
export const downloadBulkTemplate = async (req, res, next) => {
  try {
    const csvContent = [
      'itemName,sku,description,quantity,unit,rate,gstRate,lowStockAlert',
      'Sample Item 1,SKU001,Description here,100,pcs,250,18,10',
      'Sample Item 2,SKU002,Another item,50,kg,500,5,5',
      'Sample Item 3,SKU003,Third item,200,mtr,120,12,20',
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_upload_template.csv"');
    res.send(csvContent);
  } catch (error) { next(error); }
};

// @desc  Bulk upload inventory items from CSV/Excel data
// @route POST /api/inventory/bulk-upload
export const bulkUploadInventory = async (req, res, next) => {
  try {
    const { items } = req.body; // Array of item objects from parsed CSV
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items provided' });
    }

    const results = { created: 0, updated: 0, errors: [] };

    for (const item of items) {
      try {
        if (!item.itemName) { results.errors.push({ item: item.itemName || 'Unknown', error: 'Item name required' }); continue; }
        const existing = await InventoryItem.findOne({ company: req.user.company, sku: item.sku }).lean();
        if (existing) {
          await InventoryItem.updateOne({ _id: existing._id }, {
            itemName: item.itemName,
            description: item.description || existing.description,
            quantity: parseFloat(item.quantity) || existing.quantity,
            unit: item.unit || existing.unit,
            rate: parseFloat(item.rate) || existing.rate,
            gstRate: parseFloat(item.gstRate) || existing.gstRate,
            lowStockAlert: parseFloat(item.lowStockAlert) || existing.lowStockAlert,
          });
          results.updated++;
        } else {
          await InventoryItem.create({
            company: req.user.company,
            itemName: item.itemName,
            sku: item.sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
            description: item.description || '',
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || 'pcs',
            rate: parseFloat(item.rate) || 0,
            gstRate: parseFloat(item.gstRate) || 0,
            lowStockAlert: parseFloat(item.lowStockAlert) || 0,
            createdBy: req.user.id,
          });
          results.created++;
        }
      } catch (e) { results.errors.push({ item: item.itemName || 'Unknown', error: e.message }); }
    }

    res.json({ success: true, message: `${results.created} created, ${results.updated} updated`, data: results });
  } catch (error) { next(error); }
};
