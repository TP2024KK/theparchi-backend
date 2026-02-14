import express from 'express';
import {
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
  removeTeamMember
} from '../controllers/teamController.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get team members - all authenticated users can view
router.get('/', getTeamMembers);

// Add, update, delete team members - only owner and admin
router.post('/', restrictTo('owner', 'admin'), addTeamMember);
router.put('/:id', restrictTo('owner', 'admin'), updateTeamMember);
router.delete('/:id', restrictTo('owner'), removeTeamMember);

export default router;
