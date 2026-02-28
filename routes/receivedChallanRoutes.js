import express from 'express';
import {
  getReceivedChallans, acceptReceivedChallan, rejectReceivedChallan,
  createReceiverReturnChallan, getReceivedItems, getSenderCompanies,
  createMultiChallanReturn, getReceiverReturnsSent, getReceiverLedger,
  getReceivedChallanById
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
router.get('/returns-sent', getReceiverReturnsSent);
router.get('/ledger', getReceiverLedger);
router.get('/:id', getReceivedChallanById);   // MUST be last — after all named routes

export default router;
