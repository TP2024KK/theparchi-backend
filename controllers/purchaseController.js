import PurchaseEntry from '../models/PurchaseEntry.js';
import InventoryItem from '../models/InventoryItem.js';
import StockMovement from '../models/StockMovement.js';
import Warehouse from '../models/Warehouse.js';
import Location from '../models/Location.js';
import Company from '../models/Company.js';

// ── Helper: generate next purchase number ─────────────────────────────────────
const generatePurchaseNumber = async (companyId) => {
  const company = await Company.findById(companyId).select('settings');
  const prefix = company?.settings?.purchasePrefix || 'PO';
  const next = (company?.settings?.nextPurchaseNumber || 1);
  const num = `${prefix}-${String(next).padStart(4, '0')}`;
  // Increment counter
  await Company.findByIdAndUpdate(companyId, {
    'settings.nextPurchaseNumber': next + 1
  });
  return num;
};

// ── Helper: calculate item totals ─────────────────────────────────────────────
const calcItemTotals = (item) => {
  const base = (item.orderedQty || 0) * (item.unitPrice || 0);
  const gstAmt = (base * (item.gstRate || 0)) / 100;
  return {
    ...item,
    gstAmount: Math.round(gstAmt * 100) / 100,
    totalAmount: Math.round((base + gstAmt) * 100) / 100,
  };
};

// ── GET /api/purchase-entries ─────────────────────────────────────────────────
export const getPurchaseEntries = async (req, res, next) => {
  try {
    const { status, from, to, search } = req.query;
    const query = { company: req.user.company };

    if (status && status !== 'all') query.status = status;
    if (from || to) {
      query.purchaseDate = {};
      if (from) query.purchaseDate.$gte = new Date(from);
      if (to) query.purchaseDate.$lte = new Date(to + 'T23:59:59');
    }
    if (search) {
      query.$or = [
        { purchaseNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { supplierInvoiceNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const entries = await PurchaseEntry.find(query)
      .populate('warehouse', 'name code')
      .populate('location', 'name code')
      .populate('createdBy', 'name')
      .populate('receivedBy', 'name')
      .sort({ purchaseDate: -1 });

    res.json({ success: true, data: entries, count: entries.length });
  } catch (err) { next(err); }
};

// ── GET /api/purchase-entries/:id ─────────────────────────────────────────────
export const getPurchaseEntry = async (req, res, next) => {
  try {
    const entry = await PurchaseEntry.findOne({ _id: req.params.id, company: req.user.company })
      .populate('warehouse', 'name code')
      .populate('location', 'name code')
      .populate('createdBy', 'name')
      .populate('receivedBy', 'name')
      .populate('items.inventoryItem', 'name sku currentStock unit');

    if (!entry) return res.status(404).json({ success: false, message: 'Purchase entry not found' });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
};

// ── POST /api/purchase-entries ────────────────────────────────────────────────
export const createPurchaseEntry = async (req, res, next) => {
  try {
    const {
      supplierName, supplierPhone, supplierGST, supplierInvoiceNumber,
      purchaseDate, expectedDelivery, warehouseId, locationId,
      items, notes, status
    } = req.body;

    if (!items?.length) return res.status(400).json({ success: false, message: 'At least one item required' });

    // Resolve warehouse
    let resolvedWH = null;
    if (warehouseId) {
      resolvedWH = await Warehouse.findOne({ _id: warehouseId, company: req.user.company, isActive: true });
    }
    if (!resolvedWH) {
      resolvedWH = await Warehouse.findOne({ company: req.user.company, isDefault: true, isActive: true });
    }
    if (!resolvedWH) {
      resolvedWH = await Warehouse.findOne({ company: req.user.company, isActive: true });
    }

    let resolvedLoc = null;
    if (locationId && resolvedWH) {
      resolvedLoc = await Location.findOne({
        _id: locationId, warehouse: resolvedWH._id,
        company: req.user.company, isActive: true
      });
    }

    // Calculate item totals
    const processedItems = items.map(calcItemTotals);

    const subtotal = processedItems.reduce((s, i) => s + (i.orderedQty * i.unitPrice), 0);
    const totalGST = processedItems.reduce((s, i) => s + i.gstAmount, 0);
    const grandTotal = subtotal + totalGST;

    const purchaseNumber = await generatePurchaseNumber(req.user.company);

    const entry = await PurchaseEntry.create({
      company: req.user.company,
      purchaseNumber,
      supplierName, supplierPhone, supplierGST, supplierInvoiceNumber,
      purchaseDate: purchaseDate || new Date(),
      expectedDelivery: expectedDelivery || null,
      warehouse: resolvedWH?._id || null,
      location: resolvedLoc?._id || null,
      items: processedItems,
      subtotal, totalGST, grandTotal,
      status: status || 'draft',
      createdBy: req.user.id,
      notes,
    });

    const populated = await PurchaseEntry.findById(entry._id)
      .populate('warehouse', 'name code')
      .populate('location', 'name code')
      .populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      message: `Purchase Entry ${purchaseNumber} created!`,
      data: populated
    });
  } catch (err) { next(err); }
};

// ── PUT /api/purchase-entries/:id ─────────────────────────────────────────────
export const updatePurchaseEntry = async (req, res, next) => {
  try {
    const entry = await PurchaseEntry.findOne({ _id: req.params.id, company: req.user.company });
    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });

    if (['received', 'cancelled'].includes(entry.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a ${entry.status} purchase entry` });
    }

    const {
      supplierName, supplierPhone, supplierGST, supplierInvoiceNumber,
      purchaseDate, expectedDelivery, warehouseId, locationId,
      items, notes, status
    } = req.body;

    if (items?.length) {
      const processedItems = items.map(calcItemTotals);
      entry.items = processedItems;
      entry.subtotal = processedItems.reduce((s, i) => s + (i.orderedQty * i.unitPrice), 0);
      entry.totalGST = processedItems.reduce((s, i) => s + i.gstAmount, 0);
      entry.grandTotal = entry.subtotal + entry.totalGST;
    }

    if (warehouseId) {
      const wh = await Warehouse.findOne({ _id: warehouseId, company: req.user.company, isActive: true });
      if (wh) entry.warehouse = wh._id;
    }

    if (supplierName !== undefined) entry.supplierName = supplierName;
    if (supplierPhone !== undefined) entry.supplierPhone = supplierPhone;
    if (supplierGST !== undefined) entry.supplierGST = supplierGST;
    if (supplierInvoiceNumber !== undefined) entry.supplierInvoiceNumber = supplierInvoiceNumber;
    if (purchaseDate) entry.purchaseDate = purchaseDate;
    if (expectedDelivery) entry.expectedDelivery = expectedDelivery;
    if (notes !== undefined) entry.notes = notes;
    if (status && !['received', 'cancelled'].includes(status)) entry.status = status;

    await entry.save();

    const populated = await PurchaseEntry.findById(entry._id)
      .populate('warehouse', 'name code')
      .populate('location', 'name code')
      .populate('createdBy', 'name')
      .populate('items.inventoryItem', 'name sku');

    res.json({ success: true, message: 'Purchase entry updated', data: populated });
  } catch (err) { next(err); }
};

// ── POST /api/purchase-entries/:id/receive ────────────────────────────────────
// The core GRN action — mark items as received, add stock to warehouse
export const receivePurchaseEntry = async (req, res, next) => {
  try {
    const { receivedItems, notes } = req.body;
    // receivedItems = [{ itemId, receivedQty, inventoryItemId (optional) }]

    const entry = await PurchaseEntry.findOne({ _id: req.params.id, company: req.user.company })
      .populate('warehouse')
      .populate('location');

    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
    if (entry.status === 'cancelled') return res.status(400).json({ success: false, message: 'Cannot receive a cancelled entry' });
    if (entry.status === 'received') return res.status(400).json({ success: false, message: 'Already fully received' });

    const warehouseId = entry.warehouse?._id || entry.warehouse;
    const locationId = entry.location?._id || entry.location || null;

    if (!warehouseId) return res.status(400).json({ success: false, message: 'No warehouse set on this purchase entry' });

    let totalReceivedValue = entry.totalReceivedValue || 0;

    for (const recv of receivedItems) {
      const entryItem = entry.items.id(recv.itemId);
      if (!entryItem) continue;

      const qty = Number(recv.receivedQty) || 0;
      if (qty <= 0) continue;

      const maxCanReceive = entryItem.orderedQty - entryItem.receivedQty;
      const actualQty = Math.min(qty, maxCanReceive);
      if (actualQty <= 0) continue;

      // Update received qty on the entry item
      entryItem.receivedQty = (entryItem.receivedQty || 0) + actualQty;

      totalReceivedValue += actualQty * (entryItem.unitPrice || 0);

      // Find or create inventory item
      let invItemId = recv.inventoryItemId || entryItem.inventoryItem;

      // If new item (isNewItem flag), create it now
      if (entryItem.isNewItem && !invItemId) {
        const sku = entryItem.sku?.trim()?.toUpperCase()
          || await InventoryItem.generateSKU(req.user.company);

        const barcodeId = InventoryItem.generateBarcodeId(req.user.company, sku);

        const newItem = new InventoryItem({
          company: req.user.company,
          name: entryItem.itemName,
          sku, barcodeId,
          unit: entryItem.unit || 'pcs',
          hsnCode: entryItem.hsnCode || '',
          gstRate: entryItem.gstRate || 0,
          purchasePrice: entryItem.unitPrice || 0,
          avgPurchasePrice: entryItem.unitPrice || 0,
          lastPurchasePrice: entryItem.unitPrice || 0,
          sellingPrice: entryItem.newItemSellingPrice || 0,
          reorderPoint: entryItem.newItemReorderPoint || 0,
          category: entryItem.newItemCategory || '',
          currentStock: 0,
        });

        newItem.addToLocation(warehouseId, locationId, actualQty);
        await newItem.save();
        invItemId = newItem._id;

        // Link back to entry item
        entryItem.inventoryItem = invItemId;
        entryItem.isNewItem = false; // mark as created

      } else if (invItemId) {
        // Existing item — add stock to warehouse/location
        const invItem = await InventoryItem.findOne({ _id: invItemId, company: req.user.company });
        if (invItem) {
          const beforeQty = invItem.currentStock;
          invItem.addToLocation(warehouseId, locationId, actualQty);

          // Update pricing
          invItem.lastPurchasePrice = entryItem.unitPrice || invItem.lastPurchasePrice;
          // Weighted average
          if (entryItem.unitPrice > 0) {
            const totalVal = (beforeQty * (invItem.avgPurchasePrice || 0)) + (actualQty * entryItem.unitPrice);
            invItem.avgPurchasePrice = invItem.currentStock > 0 ? totalVal / invItem.currentStock : entryItem.unitPrice;
            invItem.purchasePrice = entryItem.unitPrice;
          }

          await invItem.save();

          // Log stock movement
          await StockMovement.create({
            company: req.user.company,
            item: invItemId,
            warehouse: warehouseId,
            location: locationId,
            type: 'IN',
            reason: 'purchase',
            quantity: actualQty,
            beforeQty: beforeQty,
            afterQty: invItem.currentStock,
            unitPrice: entryItem.unitPrice || 0,
            totalValue: (entryItem.unitPrice || 0) * actualQty,
            performedBy: req.user.id,
            notes: `GRN: ${entry.purchaseNumber}${entry.supplierName ? ` from ${entry.supplierName}` : ''}`,
          });
        }
      }
    }

    // Update entry status
    const allReceived = entry.items.every(i => i.receivedQty >= i.orderedQty);
    const anyReceived = entry.items.some(i => i.receivedQty > 0);

    entry.status = allReceived ? 'received' : anyReceived ? 'partially_received' : entry.status;
    entry.totalReceivedValue = totalReceivedValue;
    if (allReceived) {
      entry.receivedBy = req.user.id;
      entry.receivedAt = new Date();
    }
    if (notes) entry.notes = (entry.notes ? entry.notes + '\n' : '') + notes;

    await entry.save();

    const populated = await PurchaseEntry.findById(entry._id)
      .populate('warehouse', 'name code')
      .populate('location', 'name')
      .populate('createdBy', 'name')
      .populate('receivedBy', 'name')
      .populate('items.inventoryItem', 'name sku currentStock');

    res.json({
      success: true,
      message: allReceived ? 'All items received! Stock updated.' : 'Partial receipt recorded. Stock updated.',
      data: populated
    });
  } catch (err) { next(err); }
};

// ── POST /api/purchase-entries/:id/cancel ─────────────────────────────────────
export const cancelPurchaseEntry = async (req, res, next) => {
  try {
    const entry = await PurchaseEntry.findOne({ _id: req.params.id, company: req.user.company });
    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });

    if (entry.status === 'received') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a fully received entry. Stock has already been updated.' });
    }

    entry.status = 'cancelled';
    await entry.save();

    res.json({ success: true, message: 'Purchase entry cancelled', data: entry });
  } catch (err) { next(err); }
};

// ── DELETE /api/purchase-entries/:id ─────────────────────────────────────────
export const deletePurchaseEntry = async (req, res, next) => {
  try {
    const entry = await PurchaseEntry.findOne({ _id: req.params.id, company: req.user.company });
    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });

    if (['received', 'partially_received'].includes(entry.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an entry where stock has already been received.'
      });
    }

    await PurchaseEntry.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'Purchase entry deleted' });
  } catch (err) { next(err); }
};

// ── GET /api/purchase-entries/summary ────────────────────────────────────────
export const getPurchaseSummary = async (req, res, next) => {
  try {
    const [total, draft, ordered, partiallyReceived, received, cancelled] = await Promise.all([
      PurchaseEntry.countDocuments({ company: req.user.company }),
      PurchaseEntry.countDocuments({ company: req.user.company, status: 'draft' }),
      PurchaseEntry.countDocuments({ company: req.user.company, status: 'ordered' }),
      PurchaseEntry.countDocuments({ company: req.user.company, status: 'partially_received' }),
      PurchaseEntry.countDocuments({ company: req.user.company, status: 'received' }),
      PurchaseEntry.countDocuments({ company: req.user.company, status: 'cancelled' }),
    ]);

    const totalValueResult = await PurchaseEntry.aggregate([
      { $match: { company: req.user.company, status: { $in: ['ordered', 'partially_received', 'received'] } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]);

    res.json({
      success: true,
      data: {
        total, draft, ordered, partiallyReceived, received, cancelled,
        totalValue: totalValueResult[0]?.total || 0
      }
    });
  } catch (err) { next(err); }
};
