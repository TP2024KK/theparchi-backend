import express from 'express';
import {
  createChallan,
  getChallans,
  getChallan,
  updateChallan,
  deleteChallan,
  getChallanStats,
  sendChallan,
  selfActionChallan
} from '../controllers/challanController.js';
import { protect, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Stats route (before :id route)
router.get('/stats', getChallanStats);

// Send challan to party
router.post('/:id/send', sendChallan);

// Self Accept/Reject
router.post('/:id/self-action', selfActionChallan);

// CRUD routes
router.route('/')
  .get(checkPermission('challans', 'read'), getChallans)
  .post(checkPermission('challans', 'create'), createChallan);

router.route('/:id')
  .get(checkPermission('challans', 'read'), getChallan)
  .put(checkPermission('challans', 'update'), updateChallan)
  .delete(checkPermission('challans', 'delete'), deleteChallan);

export default router;
