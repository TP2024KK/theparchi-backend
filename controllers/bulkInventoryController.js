import InventoryItem from '../models/InventoryItem.js';
import Company from '../models/Company.js';

// GET /api/inventory/bulk-sample-csv
export const getBulkInventorySampleCSV = async (req, res, next) => {
  try {
    const { templateId } = req.query;
    const company = await Company.findById(req.user.company);
    const template = company.challanTemplates?.find(
      t => t._id?.toString() === templateId
    ) || null;
    const customCols = template?.customColumns?.map(c => c.name) || [];

    const baseHeaders = [
      'SKU', 'Name', 'Category', 'Unit',
      'PurchasePrice', 'SellingPrice', 'CurrentStock',
      'ReorderPoint', 'HsnCode', 'Description'
    ];
    const headers = [...baseHeaders, ...customCols];

    const sampleRows = [
      headers.join(','),
      [
        'SKU001', 'Product Name', 'Category A', 'pcs',
        '200', '350', '100', '10', '61091000', 'Optional description',
        ...customCols.map(() => 'value'),
      ].join(','),
      [
        'SKU002', 'Another Product', 'Category B', 'mtrs',
        '150', '280', '50', '5', '',  '',
        ...customCols.map(() => ''),
      ].join(','),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition',
      `attachment; filename="bulk_inventory_sample${template ? '_' + template.name : ''}.csv"`);
    res.send(sampleRows.join('\n'));
  } catch (error) { next(error); }
};

// POST /api/inventory/bulk-validate
export const validateBulkInventory = async (req, res, next) => {
  try {
    const { rows, templateId } = req.body;
    const company = await Company.findById(req.user.company);
    const template = company.challanTemplates?.find(
      t => t._id?.toString() === templateId
    ) || null;
    const customCols = template?.customColumns?.map(c => c.name) || [];

    // Load existing SKUs for duplicate detection
    const existingItems = await InventoryItem.find({
      company: req.user.company,
      sku: { $in: rows.map(r => (r.SKU || r.sku || '').trim().toUpperCase()).filter(Boolean) }
    });
    const existingSkuMap = {};
    existingItems.forEach(i => { existingSkuMap[i.sku] = i; });

    const previews = [];

    rows.forEach((row, idx) => {
      const lineNum = idx + 2;
      const errors = [];

      const sku = (row.SKU || row.sku || '').trim().toUpperCase();
      const name = (row.Name || row.name || '').trim();

      if (!sku) errors.push('SKU is required');
      if (!name) errors.push('Name is required');

      const purchasePrice = parseFloat(row.PurchasePrice || row.purchaseprice || 0);
      const sellingPrice  = parseFloat(row.SellingPrice  || row.sellingprice  || 0);
      const currentStock  = parseFloat(row.CurrentStock  || row.currentstock  || 0);
      const reorderPoint  = parseFloat(row.ReorderPoint  || row.reorderpoint  || 0);

      const customData = {};
      customCols.forEach(col => {
        customData[col] = row[col] || '';
      });

      const isUpdate = !!existingSkuMap[sku];

      previews.push({
        lineNum,
        sku,
        name,
        category: row.Category || row.category || '',
        unit: row.Unit || row.unit || 'pcs',
        purchasePrice,
        sellingPrice,
        currentStock,
        reorderPoint,
        hsnCode: row.HsnCode || row.hsncode || row.HSN || '',
        description: row.Description || row.description || '',
        customData,
        isUpdate,
        errors,
        hasErrors: errors.length > 0,
      });
    });

    const valid   = previews.filter(p => !p.hasErrors).length;
    const errors  = previews.filter(p =>  p.hasErrors).length;
    const updates = previews.filter(p => !p.hasErrors && p.isUpdate).length;
    const creates = previews.filter(p => !p.hasErrors && !p.isUpdate).length;

    res.json({
      success: true,
      data: {
        previews,
        summary: { total: previews.length, valid, errors, updates, creates }
      }
    });
  } catch (error) { next(error); }
};

// POST /api/inventory/bulk-create
export const createBulkInventory = async (req, res, next) => {
  try {
    const { previews, templateId } = req.body;
    const company = await Company.findById(req.user.company);
    const template = company.challanTemplates?.find(
      t => t._id?.toString() === templateId
    ) || null;

    const created = [], updated = [], failed = [];

    for (const item of previews) {
      if (item.hasErrors) continue;
      try {
        const barcodeId = `${req.user.company}-${item.sku}`;
        const data = {
          company: req.user.company,
          sku: item.sku,
          name: item.name,
          category: item.category,
          unit: item.unit,
          purchasePrice: item.purchasePrice,
          sellingPrice: item.sellingPrice,
          currentStock: item.currentStock,
          reorderPoint: item.reorderPoint,
          hsnCode: item.hsnCode,
          description: item.description,
          barcodeId,
          // Store template default values
          templateDefaults: template ? [{
            templateId: template._id,
            templateName: template.name,
            values: item.customData,
          }] : [],
        };

        if (item.isUpdate) {
          await InventoryItem.updateOne(
            { company: req.user.company, sku: item.sku },
            { $set: data }
          );
          updated.push(item.sku);
        } else {
          await InventoryItem.create(data);
          created.push(item.sku);
        }
      } catch (err) {
        failed.push({ sku: item.sku, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Created ${created.length}, updated ${updated.length} items`,
      data: { created, updated, failed }
    });
  } catch (error) { next(error); }
};
