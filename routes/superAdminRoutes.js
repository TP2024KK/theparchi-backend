import express from 'express';
import {
  getOverview, getCompanies, getCompany, updateCompanyPlan,
  suspendCompany, activateCompany, getAllUsers, getGrowthData
} from '../controllers/superAdminController.js';
import { protect } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();
router.use(protect, requireSuperAdmin);

router.get('/overview', getOverview);
router.get('/companies', getCompanies);
router.get('/companies/:id', getCompany);
router.put('/companies/:id/plan', updateCompanyPlan);
router.post('/companies/:id/suspend', suspendCompany);
router.post('/companies/:id/activate', activateCompany);
router.get('/users', getAllUsers);
router.get('/growth', getGrowthData);

export default router;
