import express from 'express';
import {
  getInventoryItems, searchInventoryItems, getInventoryItem,
  createInventoryItem, updateInventoryItem, deleteInventoryItem,
  adjustStock, getItemMovements, getItemByBarcode
} from '../controllers/inventoryController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/search', searchInventoryItems);
router.route('/').get(getInventoryItems).post(createInventoryItem);
router.get('/scan/:barcodeId', getItemByBarcode);
router.route('/:id').get(getInventoryItem).put(updateInventoryItem).delete(deleteInventoryItem);
router.post('/:id/adjust', adjustStock);
router.get('/:id/movements', getItemMovements);

export default router;
