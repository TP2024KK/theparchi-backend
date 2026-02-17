import express from 'express';
import {
  getReceivedChallans, acceptReceivedChallan, rejectReceivedChallan,
  createReceiverReturnChallan, getReceivedItems, getSenderCompanies,
  createMultiChallanReturn, getReceiverReturnsSent, getReceiverLedger
} from '../controllers/receivedChallanController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/', getReceivedChallans);
router.post('/:id/accept', acceptReceivedChallan);
router.post('/:id/reject', rejectReceivedChallan);
router.post('/:id/return', createReceiverReturnChallan);
router.get('/items', getReceivedItems);
router.get('/senders', getSenderCompanies);
router.post('/create-return', createMultiChallanReturn);
router.get('/returns-sent', getReceiverReturnsSent);   // NEW: returns receiver sent to senders
router.get('/ledger', getReceiverLedger);              // NEW: receiver's own ledger

export default router;
