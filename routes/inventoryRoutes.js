import express from 'express';
import {
  getInventoryItems, searchInventoryItems, getInventoryItem,
  createInventoryItem, updateInventoryItem, deleteInventoryItem,
  adjustStock, transferStock, getItemMovements,
  downloadBulkTemplate, bulkValidateInventory, bulkUploadInventory,
  scanInventoryItem, backfillBarcodes
} from '../controllers/inventoryController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

// ── Static routes MUST come before /:id ───────────────────────────────────────
router.get('/search', searchInventoryItems);
router.get('/bulk-template', downloadBulkTemplate);
router.get('/backfill-barcodes', backfillBarcodes);
router.post('/bulk-validate', bulkValidateInventory);
router.post('/bulk-upload', bulkUploadInventory);
router.post('/transfer', transferStock);

// CRITICAL: scan route before /:id (otherwise 'scan' is treated as a MongoDB ObjectId)
router.get('/scan/:barcodeId', scanInventoryItem);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.route('/').get(getInventoryItems).post(createInventoryItem);
router.route('/:id').get(getInventoryItem).put(updateInventoryItem).delete(deleteInventoryItem);
router.post('/:id/adjust', adjustStock);
router.get('/:id/movements', getItemMovements);

export default router;
