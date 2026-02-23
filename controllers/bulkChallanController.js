import Challan from '../models/Challan.js';
import Company from '../models/Company.js';
import Party from '../models/Party.js';
import InventoryItem from '../models/InventoryItem.js';
import { deductStockForChallan } from './inventoryController.js';
import crypto from 'crypto';

// Helper: calculate totals
const calcTotals = (items) => {
  let subtotal = 0, totalGST = 0;
  const processed = items.map(item => {
    const amount = (item.quantity || 0) * (item.rate || 0);
    const gstAmount = (amount * (item.gstRate || 0)) / 100;
    subtotal += amount;
    totalGST += gstAmount;
    return { ...item, amount, gstAmount };
  });
  return { items: processed, subtotal, totalGST, grandTotal: subtotal + totalGST };
};

// POST /api/challans/bulk-validate
// Validates CSV data and returns preview without creating anything
export const validateBulkChallan = async (req, res, next) => {
  try {
    const { rows, templateId, itemSource } = req.body;
    // rows = parsed CSV rows array
    // itemSource: 'inventory' | 'manual' | 'mixed'

    const company = await Company.findById(req.user.company)
      .populate('settings');

    // Load all parties for this company (for partyCode lookup)
    const parties = await Party.find({ company: req.user.company });
    const partyByCode = {};
    parties.forEach(p => {
      if (p.partyCode) partyByCode[p.partyCode.toLowerCase()] = p;
    });

    // Load template
    const template = company.challanTemplates?.find(
      t => t._id?.toString() === templateId
    ) || company.challanTemplates?.[0];
    const customCols = template?.customColumns?.map(c => c.name) || [];

    // Group rows by ChallanRef
    const grouped = {};
    const rowErrors = [];

    rows.forEach((row, idx) => {
      const lineNum = idx + 2; // +2 for header row
      const ref = (row.ChallanRef || row.challanref || row.challan_ref || '').trim();
      if (!ref) {
        rowErrors.push({ line: lineNum, error: 'ChallanRef is required' });
        return;
      }
      if (!grouped[ref]) grouped[ref] = [];
      grouped[ref].push({ ...row, _lineNum: lineNum });
    });

    // Validate each group
    const previews = [];
    const allErrors = [...rowErrors];

    for (const [ref, groupRows] of Object.entries(grouped)) {
      const firstRow = groupRows[0];
      const partyCode = (firstRow.PartyID || firstRow.partyid || firstRow.party_id || '').trim().toLowerCase();
      const party = partyByCode[partyCode];
      const challanErrors = [];

      if (!partyCode) {
        challanErrors.push(`PartyID is required`);
      } else if (!party) {
        challanErrors.push(`Party with code "${partyCode.toUpperCase()}" not found`);
      }

      const dateStr = firstRow.Date || firstRow.date || '';
      const challanDate = dateStr ? new Date(dateStr) : new Date();
      if (dateStr && isNaN(challanDate.getTime())) {
        challanErrors.push(`Invalid date: "${dateStr}"`);
      }

      // Validate and build items
      const items = [];
      for (const row of groupRows) {
        const itemErrors = [];
        let itemName = '';
        let inventoryItemId = null;
        let unit = row.Unit || row.unit || 'pcs';
        let hsn = row.HSN || row.hsn || row.HsnCode || '';

        const sku = (row.SKU || row.sku || '').trim().toUpperCase();

        if (itemSource === 'inventory' || (itemSource === 'mixed' && sku)) {
          // Try to find inventory item
          const invItem = await InventoryItem.findOne({
            company: req.user.company,
            sku,
            isActive: true
          });
          if (!invItem) {
            if (itemSource === 'inventory') {
              itemErrors.push(`SKU "${sku}" not found in inventory`);
            }
            // mixed: fall through to manual
            itemName = row.ItemName || row.itemname || row.item_name || sku || '';
          } else {
            itemName = invItem.name;
            inventoryItemId = invItem._id;
            unit = unit || invItem.unit;
            hsn = hsn || invItem.hsnCode;
          }
        } else {
          itemName = (row.ItemName || row.itemname || row.item_name || '').trim();
          if (!itemName) itemErrors.push(`ItemName is required for manual items`);
        }

        const qty = parseFloat(row.Qty || row.qty || row.Quantity || row.quantity || 0);
        const rate = parseFloat(row.Rate || row.rate || 0);
        if (!qty || qty <= 0) itemErrors.push(`Qty must be > 0`);

        // Custom column values
        const customData = {};
        customCols.forEach(col => {
          customData[col] = row[col] || '';
        });

        if (itemErrors.length > 0) {
          itemErrors.forEach(e => challanErrors.push(`Row ${row._lineNum}: ${e}`));
        } else {
          items.push({
            itemName,
            hsn,
            quantity: qty,
            unit,
            rate,
            gstRate: parseFloat(row.GSTRate || row.gstrate || row.gst_rate || 0),
            amount: qty * rate,
            gstAmount: 0,
            inventoryItemId,
            customData,
            description: row.Description || row.description || '',
          });
        }
      }

      const { items: processedItems, subtotal, totalGST, grandTotal } = calcTotals(items);

      previews.push({
        ref,
        partyName: party?.name || `Unknown (${partyCode})`,
        partyId: party?._id || null,
        challanDate: challanDate.toISOString().split('T')[0],
        notes: firstRow.Notes || firstRow.notes || '',
        items: processedItems,
        itemCount: processedItems.length,
        grandTotal,
        errors: challanErrors,
        hasErrors: challanErrors.length > 0,
      });
    }

    const validCount = previews.filter(p => !p.hasErrors).length;
    const errorCount = previews.filter(p => p.hasErrors).length;

    res.json({
      success: true,
      data: {
        previews,
        summary: {
          total: previews.length,
          valid: validCount,
          errors: errorCount,
          template: template?.name || 'Default',
        }
      }
    });
  } catch (error) { next(error); }
};

// POST /api/challans/bulk-create
// Creates validated challans as drafts
export const createBulkChallans = async (req, res, next) => {
  try {
    const { previews, templateId } = req.body;
    // previews = array from validateBulkChallan (only valid ones)

    const company = await Company.findById(req.user.company);
    const template = company.challanTemplates?.find(
      t => t._id?.toString() === templateId
    ) || null;

    const created = [];
    const failed = [];

    for (const preview of previews) {
      if (preview.hasErrors) continue; // skip errored ones

      try {
        const challanNumber = `${company.settings.challanPrefix}-${company.settings.nextChallanNumber}`;
        company.settings.nextChallanNumber += 1;

        const challan = await Challan.create({
          company: req.user.company,
          challanNumber,
          party: preview.partyId,
          challanDate: new Date(preview.challanDate),
          items: preview.items,
          subtotal: preview.items.reduce((s, i) => s + i.amount, 0),
          totalGST: preview.items.reduce((s, i) => s + (i.gstAmount || 0), 0),
          grandTotal: preview.grandTotal,
          notes: preview.notes,
          challanTemplate: template?._id || null,
          createdBy: req.user.id,
          status: 'draft',
          sfpTrail: [{ action: 'created', by: req.user.id, at: new Date() }],
          bulkRef: preview.ref, // store original ref for reference
        });

        created.push({ ref: preview.ref, challanId: challan._id, challanNumber });
      } catch (err) {
        failed.push({ ref: preview.ref, error: err.message });
      }
    }

    // Save updated challan counter
    await Company.updateOne(
      { _id: company._id },
      { 'settings.nextChallanNumber': company.settings.nextChallanNumber }
    );

    res.json({
      success: true,
      message: `Created ${created.length} challans as drafts`,
      data: { created, failed }
    });
  } catch (error) { next(error); }
};

// POST /api/challans/bulk-send
// Sends multiple draft challans
export const bulkSendChallans = async (req, res, next) => {
  try {
    const { challanIds } = req.body;
    const company = await Company.findById(req.user.company);

    const results = { sent: [], failed: [] };

    for (const id of challanIds) {
      try {
        const challan = await Challan.findOne({
          _id: id,
          company: req.user.company,
          status: { $in: ['draft', 'created'] }
        }).populate('party');

        if (!challan) {
          results.failed.push({ id, reason: 'Not found or already sent' });
          continue;
        }

        challan.status = 'sent';
        challan.publicToken = crypto.randomBytes(32).toString('hex');
        challan.emailSentAt = new Date();
        if (challan.party?.email) challan.emailSentTo = challan.party.email;
        await challan.save();

        // Deduct stock
        await deductStockForChallan({
          companyId: req.user.company,
          userId: req.user.id,
          challanId: challan._id,
          items: challan.items,
        });

        results.sent.push({ id, challanNumber: challan.challanNumber });
      } catch (err) {
        results.failed.push({ id, reason: err.message });
      }
    }

    res.json({
      success: true,
      message: `Sent ${results.sent.length} challans`,
      data: results
    });
  } catch (error) { next(error); }
};

// GET /api/challans/bulk-sample-csv
// Returns sample CSV content for given template + itemSource
export const getBulkSampleCSV = async (req, res, next) => {
  try {
    const { templateId, itemSource = 'mixed' } = req.query;
    const company = await Company.findById(req.user.company);
    const template = company.challanTemplates?.find(
      t => t._id?.toString() === templateId
    ) || company.challanTemplates?.[0];
    const customCols = template?.customColumns?.map(c => c.name) || [];

    // Build headers based on itemSource
    const baseHeaders = ['ChallanRef', 'PartyID', 'Date', 'Notes'];
    let itemHeaders = [];

    if (itemSource === 'inventory') {
      itemHeaders = ['SKU', 'Qty', 'Rate', 'GSTRate'];
    } else if (itemSource === 'manual') {
      itemHeaders = ['ItemName', 'HSN', 'Qty', 'Unit', 'Rate', 'GSTRate', 'Description'];
    } else {
      // mixed
      itemHeaders = ['SKU', 'ItemName', 'HSN', 'Qty', 'Unit', 'Rate', 'GSTRate', 'Description'];
    }

    const headers = [...baseHeaders, ...itemHeaders, ...customCols];

    // Build sample rows
    const sampleRows = [
      headers.join(','),
      // Row 1: challan C001 item 1
      [
        'C001', 'P001',
        new Date().toISOString().split('T')[0],
        'First batch',
        ...(itemSource === 'inventory' ? ['SKU001', '10', '500', '0'] :
           itemSource === 'manual' ? ['Product Name', '1234', '10', 'pcs', '500', '0', ''] :
           ['SKU001', 'Product Name', '1234', '10', 'pcs', '500', '0', '']),
        ...customCols.map(() => 'value'),
      ].join(','),
      // Row 2: challan C001 item 2
      [
        'C001', 'P001',
        new Date().toISOString().split('T')[0],
        'First batch',
        ...(itemSource === 'inventory' ? ['SKU002', '5', '300', '0'] :
           itemSource === 'manual' ? ['Another Product', '', '5', 'pcs', '300', '0', ''] :
           ['', 'Another Product', '', '5', 'pcs', '300', '0', '']),
        ...customCols.map(() => ''),
      ].join(','),
      // Row 3: challan C002 to different party
      [
        'C002', 'P002',
        new Date().toISOString().split('T')[0],
        '',
        ...(itemSource === 'inventory' ? ['SKU001', '20', '480', '18'] :
           itemSource === 'manual' ? ['Product Name', '1234', '20', 'pcs', '480', '18', 'note'] :
           ['SKU001', 'Product Name', '1234', '20', 'pcs', '480', '18', 'note']),
        ...customCols.map(() => ''),
      ].join(','),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bulk_challan_sample_${template?.name || 'default'}.csv"`);
    res.send(sampleRows.join('\n'));
  } catch (error) { next(error); }
};
