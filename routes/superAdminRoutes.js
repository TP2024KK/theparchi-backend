import express from 'express';
import {
  getOverview, getCompanies, getCompany, updateCompanyPlan,
  suspendCompany, activateCompany, getAllUsers, getGrowthData
} from '../controllers/superAdminController.js';
import { protect } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// ── ONE-TIME SETUP ROUTE (no auth needed) ─────────────────────────────────
// Call once: POST /api/superadmin/setup
// Delete or comment out after use
router.post('/setup', async (req, res) => {
  try {
    const exists = await User.findOne({ isSuperAdmin: true });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Super admin already exists' });
    }

    const hashed = await bcrypt.hash('Admin@1234', 10);
    await User.create({
      name: 'TheParchi Admin',
      email: 'kundan.08kr@gmail.com',
      password: hashed,
      role: 'super_admin',
      isSuperAdmin: true,
      company: null,
      isActive: true,
    });

    res.json({ success: true, message: '✅ Super admin created! Email: kundan.08kr@gmail.com | Password: Admin@1234' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PROTECTED ROUTES ──────────────────────────────────────────────────────
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
