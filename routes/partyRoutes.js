import express from 'express';
import {
  createParty,
  getParties,
  getParty,
  updateParty,
  deleteParty
} from '../controllers/partyController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.route('/')
  .get(getParties)
  .post(createParty);

router.route('/:id')
  .get(getParty)
  .put(updateParty)
  .delete(deleteParty);

export default router;
