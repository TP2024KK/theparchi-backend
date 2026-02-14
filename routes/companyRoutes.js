import express from 'express';
import {
  getCompany,
  updateCompany,
  updateSettings
} from '../controllers/companyController.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get company - all team members can view
router.get('/', getCompany);

// Update company - only owner and admin
router.put('/', restrictTo('owner', 'admin'), updateCompany);
router.put('/settings', restrictTo('owner', 'admin'), updateSettings);

export default router;
