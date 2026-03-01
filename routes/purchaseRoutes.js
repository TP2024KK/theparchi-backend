import express from 'express';
import {
  getPurchaseEntries, getPurchaseEntry, createPurchaseEntry,
  updatePurchaseEntry, receivePurchaseEntry, cancelPurchaseEntry,
  deletePurchaseEntry, getPurchaseSummary
} from '../controllers/purchaseController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/summary', getPurchaseSummary);
router.route('/').get(getPurchaseEntries).post(createPurchaseEntry);
router.route('/:id').get(getPurchaseEntry).put(updatePurchaseEntry).delete(deletePurchaseEntry);
router.post('/:id/receive', receivePurchaseEntry);
router.post('/:id/cancel', cancelPurchaseEntry);

export default router;
