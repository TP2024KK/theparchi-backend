import express from 'express';
import { sendChallan,
  createChallan,
  getChallans,
  getChallan,
  updateChallan,
  deleteChallan,
  getChallanStats
} from '../controllers/challanController.js';
import { sendChallan, protect, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Stats route (before :id route)
router.get('/stats', getChallanStats);

// CRUD routes
router.route('/')
  .get(checkPermission('challans', 'read'), getChallans)
  .post(checkPermission('challans', 'create'), createChallan);

router.route('/:id')
  .get(checkPermission('challans', 'read'), getChallan)
  .put(checkPermission('challans', 'update'), updateChallan)
  .delete(checkPermission('challans', 'delete'), deleteChallan);

router.post('/:id/send', protect, sendChallan);

export default router;
