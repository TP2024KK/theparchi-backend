import express from 'express';
import { getReceivedChallans, acceptReceivedChallan, rejectReceivedChallan, createReceiverReturnChallan, getReceivedItems, getSenderCompanies, createMultiChallanReturn } from '../controllers/receivedChallanController.js';
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

export default router;
