import express from 'express';
import {
  getAcceptedChallans,
  getReturnChallans,
  getReturnChallan,
  createReturnChallan,
  acceptMargin,
  getLedger,
  getReceivedReturnChallans
} from '../controllers/returnChallanController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/accepted-challans', getAcceptedChallans);
router.get('/ledger', getLedger);
router.get('/received', getReceivedReturnChallans);
router.post('/accept-margin', acceptMargin);
router.route('/').get(getReturnChallans).post(createReturnChallan);
router.route('/:id').get(getReturnChallan);

export default router;
