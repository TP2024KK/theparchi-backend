import express from 'express';
import { getWhatsAppConfig, updateWhatsAppCredentials, updateTemplate, testWhatsApp } from '../controllers/whatsappAdminController.js';
import { protect } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();

router.use(protect, requireSuperAdmin);

router.get('/config', getWhatsAppConfig);
router.put('/credentials', updateWhatsAppCredentials);
router.put('/template', updateTemplate);
router.post('/test', testWhatsApp);

export default router;
