import express from 'express';
import {
  createReturnChallan,
  getReturnChallans,
  getReturnChallan,
  updateReturnChallan,
  deleteReturnChallan
} from '../controllers/returnChallanController.js';
import { protect, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.route('/')
  .get(checkPermission('returnChallans', 'read'), getReturnChallans)
  .post(checkPermission('returnChallans', 'create'), createReturnChallan);

router.route('/:id')
  .get(checkPermission('returnChallans', 'read'), getReturnChallan)
  .put(checkPermission('returnChallans', 'update'), updateReturnChallan)
  .delete(checkPermission('returnChallans', 'delete'), deleteReturnChallan);

export default router;
