import InventoryItem from '../models/InventoryItem.js';
import StockMovement from '../models/StockMovement.js';
import Warehouse from '../models/Warehouse.js';
import Location from '../models/Location.js';
import Company from '../models/Company.js';

// ── Helper: ensure a default warehouse exists ─────────────────────────────────
const ensureDefaultWarehouse = async (companyId) => {
  let wh = await Warehouse.findOne({ company: companyId, isDefault: true, isActive: true });
  if (!wh) {
    wh = await Warehouse.findOne({ company: companyId, isActive: true });
    if (!wh) {
      wh = await Warehouse.create({
        company: companyId, name: 'Main Warehouse',
        code: 'WH1', isDefault: true, isActive: true
      });
    }
  }
  return wh;
};

// ── Helper: resolve warehouseId — use provided or fall back to default ─────────
const resolveWarehouse = async (companyId, warehouseId) => {
  if (warehouseId) {
    const wh = await Warehouse.findOne({ _id: warehouseId, company: companyId, isActive: true });
    if (wh) return wh._id;
  }
  const defaultWh = await ensureDefaultWarehouse(companyId);
  return defaultWh._id;
};

// ── Helper: validate location belongs to warehouse ────────────────────────────
const resolveLocation = async (companyId, warehouseId, locationId) => {
  if (!locationId) return null;
  const loc = await Location.findOne({
    _id: locationId, warehouse: warehouseId,
    company: companyId, isActive: true
  });
  return loc?._id || null;
};

// ── GET /api/inventory ────────────────────────────────────────────────────────
export const getInventoryItems = async (req, res, next) => {
  try {
    const { search, category, lowStock, warehouseId, locationId } = req.query;
    const query = { company: req.user.company, isActive: true };

    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    // Warehouse/location filter
    if (warehouseId) {
      if (locationId) {
        query['locationStock'] = {
          $elemMatch: { warehouse: warehouseId, location: locationId }
        };
      } else {
        query['locationStock.warehouse'] = warehouseId;
      }
    }

    let items = await InventoryItem.find(query)
      .populate('locationStock.warehouse', 'name code')
      .populate('locationStock.location', 'name code')
      .sort({ name: 1 });

    if (lowStock === 'true') {
      items = items.filter(i => i.reorderPoint > 0 && i.currentStock <= i.reorderPoint);
    }

    res.json({ success: true, data: items, count: items.length });
  } catch (error) { next(error); }
};

// ── GET /api/inventory/search ─────────────────────────────────────────────────
export const searchInventoryItems = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json({ success: true, data: [] });

    const items = await InventoryItem.find({
      company: req.user.company, isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } }
      ]
    }).limit(10).select('name sku unit currentStock sellingPrice purchasePrice hsnCode gstRate locationStock');

    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};

// ── GET /api/inventory/scan/:barcodeId ────────────────────────────────────────
export const scanInventoryItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findOne({
      barcodeId: req.params.barcodeId,
      company: req.user.company, isActive: true
    }).populate('locationStock.warehouse', 'name')
      .populate('locationStock.location', 'name');
    if (!item) return res.status(404).json({ success: false, message: 'Item not found for this barcode' });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};

// ── GET /api/inventory/backfill-barcodes ─────────────────────────────────────
export const backfillBarcodes = async (req, res, next) => {
  try {
    const items = await InventoryItem.find({
      company: req.user.company,
      $or: [{ barcodeId: null }, { barcodeId: { $exists: false } }]
    });
    let count = 0;
    for (const item of items) {
      item.barcodeId = InventoryItem.generateBarcodeId(req.user.company, item.sku);
      await item.save();
      count++;
    }
    res.json({ success: true, message: `Backfilled ${count} barcodes` });
  } catch (error) { next(error); }
};

// ── GET /api/inventory/:id ────────────────────────────────────────────────────
export const getInventoryItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findOne({ _id: req.params.id, company: req.user.company })
      .populate('locationStock.warehouse', 'name code')
      .populate('locationStock.location', 'name code');
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};

// ── GET /api/inventory/:id/movements ──────────────────────────────────────────
export const getItemMovements = async (req, res, next) => {
  try {
    const movements = await StockMovement.find({ company: req.user.company, item: req.params.id })
      .populate('performedBy', 'name')
      .populate('relatedChallan', 'challanNumber')
      .populate('warehouse', 'name code')
      .populate('location', 'name code')
      .sort({ movementDate: -1 })
      .limit(100);
    res.json({ success: true, data: movements });
  } catch (error) { next(error); }
};

// ── POST /api/inventory ───────────────────────────────────────────────────────
export const createInventoryItem = async (req, res, next) => {
  try {
    const {
      name, sku: customSku, category, description, unit, hsnCode, gstRate,
      reorderPoint, reorderQuantity, purchasePrice, sellingPrice,
      openingStock, notes, warehouseId, locationId,
      trackBatches, trackExpiry
    } = req.body;

    const sku = customSku?.trim()
      ? customSku.trim().toUpperCase()
      : await InventoryItem.generateSKU(req.user.company);

    const existing = await InventoryItem.findOne({ company: req.user.company, sku });
    if (existing) return res.status(400).json({ success: false, message: `SKU "${sku}" already exists` });

    const barcodeId = InventoryItem.generateBarcodeId(req.user.company, sku);

    const item = new InventoryItem({
      company: req.user.company,
      name, sku, barcodeId, category, description,
      unit: unit || 'pcs', hsnCode,
      gstRate: parseFloat(gstRate) || 0,
      reorderPoint: reorderPoint || 0,
      reorderQuantity: reorderQuantity || 0,
      purchasePrice: purchasePrice || 0,
      sellingPrice: sellingPrice || 0,
      avgPurchasePrice: purchasePrice || 0,
      lastPurchasePrice: purchasePrice || 0,
      currentStock: 0,
      trackBatches: !!trackBatches,
      trackExpiry: !!trackExpiry,
      notes,
    });

    // Opening stock → add to warehouse/location
    if (openingStock && Number(openingStock) > 0) {
      const qty = Number(openingStock);
      const resolvedWH = await resolveWarehouse(req.user.company, warehouseId);
      const resolvedLoc = await resolveLocation(req.user.company, resolvedWH, locationId);
      item.addToLocation(resolvedWH, resolvedLoc, qty);

      await item.save();

      await StockMovement.create({
        company: req.user.company, item: item._id,
        warehouse: resolvedWH, location: resolvedLoc,
        type: 'IN', reason: 'opening_stock',
        quantity: qty, beforeQty: 0, afterQty: qty,
        unitPrice: purchasePrice || 0,
        totalValue: (purchasePrice || 0) * qty,
        performedBy: req.user.id, notes: 'Opening stock',
      });
    } else {
      await item.save();
    }

    const populated = await InventoryItem.findById(item._id)
      .populate('locationStock.warehouse', 'name code')
      .populate('locationStock.location', 'name code');

    res.status(201).json({ success: true, message: 'Item created!', data: populated });
  } catch (error) { next(error); }
};

// ── PUT /api/inventory/:id ────────────────────────────────────────────────────
export const updateInventoryItem = async (req, res, next) => {
  try {
    const {
      name, category, description, unit, hsnCode, gstRate,
      reorderPoint, reorderQuantity, purchasePrice, sellingPrice,
      notes, trackBatches, trackExpiry
    } = req.body;

    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { name, category, description, unit, hsnCode, gstRate: parseFloat(gstRate) || 0,
        reorderPoint, reorderQuantity, purchasePrice, sellingPrice,
        notes, trackBatches, trackExpiry },
      { new: true }
    ).populate('locationStock.warehouse', 'name code')
     .populate('locationStock.location', 'name code');

    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item updated!', data: item });
  } catch (error) { next(error); }
};

// ── DELETE /api/inventory/:id ─────────────────────────────────────────────────
export const deleteInventoryItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false }, { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) { next(error); }
};

// ── POST /api/inventory/:id/adjust ───────────────────────────────────────────
export const adjustStock = async (req, res, next) => {
  try {
    const { type, quantity, reason, notes, unitPrice, warehouseId, locationId } = req.body;

    if (!['IN', 'OUT'].includes(type))
      return res.status(400).json({ success: false, message: 'Type must be IN or OUT' });
    if (!quantity || quantity <= 0)
      return res.status(400).json({ success: false, message: 'Quantity must be > 0' });

    const item = await InventoryItem.findOne({ _id: req.params.id, company: req.user.company });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const resolvedWH = await resolveWarehouse(req.user.company, warehouseId);
    const resolvedLoc = await resolveLocation(req.user.company, resolvedWH, locationId);
    const beforeQty = item.currentStock;

    if (type === 'IN') {
      item.addToLocation(resolvedWH, resolvedLoc, Number(quantity));
      if (unitPrice && unitPrice > 0) {
        item.lastPurchasePrice = unitPrice;
        const totalVal = (beforeQty * (item.avgPurchasePrice || 0)) + (Number(quantity) * unitPrice);
        item.avgPurchasePrice = item.currentStock > 0 ? totalVal / item.currentStock : unitPrice;
      }
    } else {
      const entry = item.getLocationEntry(resolvedWH, resolvedLoc);
      if (entry.currentStock < Number(quantity)) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock at this location. Available: ${entry.currentStock}, Requested: ${quantity}`
        });
      }
      item.deductFromLocation(resolvedWH, resolvedLoc, Number(quantity));
    }

    await item.save();

    await StockMovement.create({
      company: req.user.company, item: item._id,
      warehouse: resolvedWH, location: resolvedLoc,
      type,
      reason: reason || (type === 'IN' ? 'manual_in' : 'manual_out'),
      quantity: Number(quantity), beforeQty, afterQty: item.currentStock,
      unitPrice: unitPrice || item.purchasePrice || 0,
      totalValue: (unitPrice || item.purchasePrice || 0) * Number(quantity),
      performedBy: req.user.id, notes,
    });

    const populated = await InventoryItem.findById(item._id)
      .populate('locationStock.warehouse', 'name code')
      .populate('locationStock.location', 'name code');

    res.json({ success: true, message: `Stock ${type === 'IN' ? 'added' : 'removed'} successfully!`, data: populated });
  } catch (error) { next(error); }
};

// ── POST /api/inventory/transfer ─────────────────────────────────────────────
export const transferStock = async (req, res, next) => {
  try {
    const { itemId, fromWarehouseId, fromLocationId, toWarehouseId, toLocationId, quantity, notes } = req.body;

    if (!itemId || !fromWarehouseId || !toWarehouseId || !quantity || quantity <= 0)
      return res.status(400).json({ success: false, message: 'itemId, fromWarehouseId, toWarehouseId, quantity are required' });

    if (fromWarehouseId === toWarehouseId && (fromLocationId || null) === (toLocationId || null))
      return res.status(400).json({ success: false, message: 'Source and destination cannot be the same' });

    const item = await InventoryItem.findOne({ _id: itemId, company: req.user.company });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const fromWH = await Warehouse.findOne({ _id: fromWarehouseId, company: req.user.company, isActive: true });
    const toWH = await Warehouse.findOne({ _id: toWarehouseId, company: req.user.company, isActive: true });
    if (!fromWH || !toWH) return res.status(404).json({ success: false, message: 'Warehouse not found' });

    const fromLoc = fromLocationId ? await resolveLocation(req.user.company, fromWarehouseId, fromLocationId) : null;
    const toLoc = toLocationId ? await resolveLocation(req.user.company, toWarehouseId, toLocationId) : null;

    const srcEntry = item.getLocationEntry(fromWarehouseId, fromLoc);
    if (srcEntry.currentStock < Number(quantity)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock at source. Available: ${srcEntry.currentStock}, Requested: ${quantity}`
      });
    }

    const beforeQty = item.currentStock;
    item.deductFromLocation(fromWarehouseId, fromLoc, Number(quantity));
    item.addToLocation(toWarehouseId, toLoc, Number(quantity));
    await item.save();

    const transferNote = notes || `Transfer: ${fromWH.name} → ${toWH.name}`;

    await StockMovement.insertMany([
      {
        company: req.user.company, item: item._id,
        warehouse: fromWarehouseId, location: fromLoc,
        type: 'OUT', reason: 'transfer_out',
        quantity: Number(quantity), beforeQty, afterQty: item.currentStock,
        performedBy: req.user.id, notes: transferNote,
      },
      {
        company: req.user.company, item: item._id,
        warehouse: toWarehouseId, location: toLoc,
        type: 'IN', reason: 'transfer_in',
        quantity: Number(quantity), beforeQty, afterQty: item.currentStock,
        performedBy: req.user.id, notes: transferNote,
      }
    ]);

    const populated = await InventoryItem.findById(item._id)
      .populate('locationStock.warehouse', 'name code')
      .populate('locationStock.location', 'name code');

    res.json({
      success: true,
      message: `Transferred ${quantity} ${item.unit} from ${fromWH.name} → ${toWH.name}`,
      data: populated
    });
  } catch (error) { next(error); }
};

// ── Internally called: deduct stock when challan is sent ──────────────────────
export const deductStockForChallan = async ({ companyId, userId, challanId, items }) => {
  try {
    const company = await Company.findById(companyId).select('settings');
    const settings = company?.settings || {};
    if (!settings.inventoryEnabled || !settings.autoDeductOnChallan) return;

    const defaultWH = await ensureDefaultWarehouse(companyId);

    for (const item of items) {
      if (!item.inventoryItemId) continue;
      try {
        const invItem = await InventoryItem.findOne({ _id: item.inventoryItemId, company: companyId });
        if (!invItem) continue;

        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        if (settings.stockValidationOnChallan && invItem.currentStock < qty) {
          throw new Error(`Insufficient stock for "${invItem.name}". Available: ${invItem.currentStock}, Required: ${qty}`);
        }
        if (invItem.currentStock < qty) continue; // soft skip

        const beforeQty = invItem.currentStock;

        // Try default warehouse first, then spread across all locations
        const defaultEntry = invItem.getLocationEntry(defaultWH._id, null);
        if (defaultEntry.currentStock >= qty) {
          invItem.deductFromLocation(defaultWH._id, null, qty);
        } else {
          let remaining = qty;
          for (const ls of invItem.locationStock) {
            if (remaining <= 0) break;
            const deduct = Math.min(ls.currentStock, remaining);
            if (deduct > 0) { ls.currentStock -= deduct; remaining -= deduct; }
          }
          invItem.syncTotalStock();
        }

        await invItem.save();

        await StockMovement.create({
          company: companyId, item: invItem._id,
          warehouse: defaultWH._id,
          type: 'OUT', reason: 'challan_sent',
          quantity: qty, beforeQty, afterQty: invItem.currentStock,
          unitPrice: item.rate || 0, totalValue: (item.rate || 0) * qty,
          relatedChallan: challanId, performedBy: userId,
          notes: 'Auto-deducted for challan',
        });
      } catch (err) {
        if (settings.stockValidationOnChallan) throw err;
        console.error('Stock deduction error:', item.inventoryItemId, err.message);
      }
    }
  } catch (err) {
    if (err.message?.includes('Insufficient stock')) throw err;
    console.error('deductStockForChallan error:', err.message);
  }
};

// ── Internally called: add stock back when return challan received ─────────────
export const addStockForReturn = async ({ companyId, userId, returnChallanId, items }) => {
  try {
    const company = await Company.findById(companyId).select('settings');
    const settings = company?.settings || {};
    if (!settings.inventoryEnabled || !settings.autoAddOnReturn) return;

    const defaultWH = await ensureDefaultWarehouse(companyId);

    for (const item of items) {
      if (!item.inventoryItemId) continue;
      try {
        const invItem = await InventoryItem.findOne({ _id: item.inventoryItemId, company: companyId });
        if (!invItem) continue;

        const qty = item.returnedQty || item.quantity || 0;
        if (qty <= 0) continue;

        const beforeQty = invItem.currentStock;
        invItem.addToLocation(defaultWH._id, null, qty);
        await invItem.save();

        await StockMovement.create({
          company: companyId, item: invItem._id,
          warehouse: defaultWH._id,
          type: 'IN', reason: 'return_received',
          quantity: qty, beforeQty, afterQty: invItem.currentStock,
          unitPrice: item.rate || 0, totalValue: (item.rate || 0) * qty,
          relatedReturnChallan: returnChallanId, performedBy: userId,
          notes: 'Auto-added from return challan',
        });
      } catch (err) {
        console.error('Stock return error:', item.inventoryItemId, err.message);
      }
    }
  } catch (err) {
    console.error('addStockForReturn error:', err.message);
  }
};

// ── GET /api/inventory/bulk-template ─────────────────────────────────────────
export const downloadBulkTemplate = async (req, res, next) => {
  try {
    const csv = [
      'sku,name,category,hsnCode,description,currentStock,unit,purchasePrice,sellingPrice,gstRate,reorderPoint,warehouseName,locationName',
      'SKU001,Sample Item 1,Tops,621210,Desc here,100,pcs,200,250,18,10,Main Warehouse,Rack A',
      'SKU002,Sample Item 2,Dresses,621420,Another item,50,pcs,400,1399,5,5,Main Warehouse,',
      'SKU003,Sample Item 3,Fabric,520811,Third item,200,mtr,100,120,12,20,,',
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk_inventory_sample.csv"');
    res.send(csv);
  } catch (error) { next(error); }
};

// ── POST /api/inventory/bulk-validate ─────────────────────────────────────────
export const bulkValidateInventory = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows))
      return res.status(400).json({ success: false, message: 'No rows provided' });

    const previews = [];
    let creates = 0, updates = 0, errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowErrors = [];
      if (!row.name) rowErrors.push('Name is required');
      if (!row.sku) rowErrors.push('SKU is required');

      const existing = row.sku
        ? await InventoryItem.findOne({ company: req.user.company, sku: row.sku }).lean()
        : null;

      const preview = {
        lineNum: i + 2, sku: row.sku || '', name: row.name || '',
        currentStock: parseFloat(row.currentStock) || 0,
        unit: row.unit || 'pcs', purchasePrice: parseFloat(row.purchasePrice) || 0,
        sellingPrice: parseFloat(row.sellingPrice) || 0,
        reorderPoint: parseFloat(row.reorderPoint) || 0,
        category: row.category || '', hsnCode: row.hsnCode || '',
        gstRate: parseFloat(row.gstRate) || 0, description: row.description || '',
        warehouseName: row.warehouseName || '', locationName: row.locationName || '',
        isUpdate: !!existing, hasErrors: rowErrors.length > 0, errors: rowErrors,
      };

      previews.push(preview);
      if (rowErrors.length > 0) errors++;
      else if (existing) updates++;
      else creates++;
    }

    res.json({ success: true, data: { previews, summary: { creates, updates, errors, total: rows.length } } });
  } catch (error) { next(error); }
};

// ── POST /api/inventory/bulk-upload ──────────────────────────────────────────
export const bulkUploadInventory = async (req, res, next) => {
  try {
    const { previews } = req.body;
    if (!previews?.length)
      return res.status(400).json({ success: false, message: 'No items provided' });

    const created = [], updated = [], failed = [];
    const defaultWH = await ensureDefaultWarehouse(req.user.company);

    for (const row of previews) {
      try {
        const existing = row.sku
          ? await InventoryItem.findOne({ company: req.user.company, sku: row.sku })
          : null;

        let warehouseId = defaultWH._id;
        if (row.warehouseName) {
          const wh = await Warehouse.findOne({
            company: req.user.company,
            name: { $regex: row.warehouseName, $options: 'i' }, isActive: true
          });
          if (wh) warehouseId = wh._id;
        }

        let locationId = null;
        if (row.locationName) {
          const loc = await Location.findOne({
            company: req.user.company, warehouse: warehouseId,
            name: { $regex: row.locationName, $options: 'i' }, isActive: true
          });
          if (loc) locationId = loc._id;
        }

        if (existing) {
          existing.name = row.name;
          existing.description = row.description || '';
          existing.unit = row.unit || 'pcs';
          existing.sellingPrice = row.sellingPrice || 0;
          existing.purchasePrice = row.purchasePrice || 0;
          existing.reorderPoint = row.reorderPoint || 0;
          existing.category = row.category || '';
          existing.hsnCode = row.hsnCode || '';
          existing.gstRate = parseFloat(row.gstRate) || 0;
          await existing.save();
          updated.push({ sku: row.sku, name: row.name });
        } else {
          const sku = row.sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const newItem = new InventoryItem({
            company: req.user.company, name: row.name, sku,
            barcodeId: InventoryItem.generateBarcodeId(req.user.company, sku),
            description: row.description || '', unit: row.unit || 'pcs',
            sellingPrice: row.sellingPrice || 0, purchasePrice: row.purchasePrice || 0,
            avgPurchasePrice: row.purchasePrice || 0,
            reorderPoint: row.reorderPoint || 0, category: row.category || '',
            hsnCode: row.hsnCode || '', gstRate: parseFloat(row.gstRate) || 0,
            currentStock: 0,
          });

          if (row.currentStock > 0) {
            newItem.addToLocation(warehouseId, locationId, row.currentStock);
          }

          await newItem.save();

          if (row.currentStock > 0) {
            await StockMovement.create({
              company: req.user.company, item: newItem._id,
              warehouse: warehouseId, location: locationId,
              type: 'IN', reason: 'opening_stock',
              quantity: row.currentStock, beforeQty: 0, afterQty: row.currentStock,
              unitPrice: row.purchasePrice || 0,
              totalValue: (row.purchasePrice || 0) * row.currentStock,
              notes: 'Bulk upload opening stock',
            });
          }
          created.push({ sku, name: row.name });
        }
      } catch (e) {
        failed.push({ sku: row.sku, name: row.name, error: e.message });
      }
    }

    res.json({
      success: true,
      message: `${created.length} created, ${updated.length} updated${failed.length ? `, ${failed.length} failed` : ''}`,
      data: { created, updated, failed }
    });
  } catch (error) { next(error); }
};

// ── POST /api/inventory/migrate-location-stock ────────────────────────────────
// One-time migration: moves currentStock into default warehouse locationStock
// Safe to run multiple times — skips items that already have locationStock
export const migrateToLocationStock = async (req, res, next) => {
  try {
    const defaultWH = await ensureDefaultWarehouse(req.user.company);

    const items = await InventoryItem.find({
      company: req.user.company,
      isActive: true,
      currentStock: { $gt: 0 },
      $or: [
        { locationStock: { $size: 0 } },
        { locationStock: { $exists: false } }
      ]
    });

    let migrated = 0;
    for (const item of items) {
      // Double-check it really has no location stock
      const hasStock = item.locationStock?.some(ls => ls.currentStock > 0);
      if (hasStock) continue;

      item.locationStock = [];
      item.addToLocation(defaultWH._id, null, item.currentStock);
      await item.save();

      // Log as adjustment so there is an audit trail
      await StockMovement.create({
        company: req.user.company,
        item: item._id,
        warehouse: defaultWH._id,
        type: 'IN',
        reason: 'adjustment',
        quantity: item.currentStock,
        beforeQty: 0,
        afterQty: item.currentStock,
        performedBy: req.user.id,
        notes: `Migrated to warehouse stock — ${defaultWH.name}`,
      });

      migrated++;
    }

    res.json({
      success: true,
      message: migrated > 0
        ? `Migrated ${migrated} item${migrated > 1 ? 's' : ''} to ${defaultWH.name}`
        : 'All items already have warehouse stock assigned. Nothing to migrate.',
      data: { migrated, warehouse: defaultWH.name }
    });
  } catch (error) { next(error); }
};
