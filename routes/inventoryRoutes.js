import express from 'express';
import {
  getInventoryItems, searchInventoryItems, getInventoryItem,
  createInventoryItem, updateInventoryItem, deleteInventoryItem,
  adjustStock, getItemMovements
} from '../controllers/inventoryController.js';
import { getBulkInventorySampleCSV, validateBulkInventory, createBulkInventory } from '../controllers/bulkInventoryController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/search', searchInventoryItems);
router.get('/bulk-sample-csv', getBulkInventorySampleCSV);
router.post('/bulk-validate', validateBulkInventory);
router.post('/bulk-create', createBulkInventory);
router.route('/').get(getInventoryItems).post(createInventoryItem);
router.route('/:id').get(getInventoryItem).put(updateInventoryItem).delete(deleteInventoryItem);
router.post('/:id/adjust', adjustStock);
router.get('/:id/movements', getItemMovements);

export default router;
