import express from 'express';
import { getPayments, addPayment, deletePayment, getBatchSummary } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.post('/batch-summary', getBatchSummary);
router.get('/:challanId', getPayments);
router.post('/:challanId', addPayment);
router.delete('/:paymentId', deletePayment);

export default router;
