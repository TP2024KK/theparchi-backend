import express from 'express';
import {
  createParty,
  getParties,
  getParty,
  updateParty,
  deleteParty
} from '../controllers/partyController.js';
import { protect, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.route('/')
  .get(checkPermission('parties', 'read'), getParties)
  .post(checkPermission('parties', 'create'), createParty);

router.route('/:id')
  .get(checkPermission('parties', 'read'), getParty)
  .put(checkPermission('parties', 'update'), updateParty)
  .delete(checkPermission('parties', 'delete'), deleteParty);

export default router;
