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
import { protect } from '../middleware/auth.js';

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
  .get(getChallans)
  .post(createChallan);

router.route('/:id')
  .get(getChallan)
  .put(updateChallan)
  .delete(deleteChallan);

export default router;
