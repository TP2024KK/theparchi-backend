import express from 'express';
import {
  getBillingOverview, getAllInvoices,
  manualActivate, manualAddCredits, adminCancelSubscription,
  getGatewayConfig, saveGatewayConfig, testGateway,
} from '../controllers/superAdminSubscriptionController.js';
import { protect } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();
router.use(protect, requireSuperAdmin);

router.get('/overview', getBillingOverview);
router.get('/invoices', getAllInvoices);
router.post('/manual-activate', manualActivate);
router.post('/add-whatsapp-credits', manualAddCredits);
router.post('/cancel', adminCancelSubscription);
router.get('/gateway-config', getGatewayConfig);
router.put('/gateway-config', saveGatewayConfig);
router.post('/test-gateway', testGateway);

export default router;
