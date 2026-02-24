import express from 'express';
import {
  getCompany, updateCompany, updateSettings,
  lookupByCode, addPrefix, deletePrefix, assignPartyPrefix
} from '../controllers/companyController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import PaymentGatewayConfig from '../models/PaymentGatewayConfig.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get company - all team members can view
router.get('/', getCompany);

// Update company - only owner and admin
router.put('/', restrictTo('owner', 'admin'), updateCompany);
router.put('/settings', restrictTo('owner', 'admin'), updateSettings);

// Returns ONLY the public Key ID (safe to send to frontend — not the secret)
router.get('/payment-config', async (req, res) => {
  try {
    const config = await PaymentGatewayConfig.findOne({ gateway: 'razorpay', isActive: true })
      .select('razorpay.keyId razorpay.mode')
      .lean();

    if (!config?.razorpay?.keyId) {
      return res.json({ success: true, data: { configured: false } });
    }

    res.json({
      success: true,
      data: {
        configured: true,
        keyId: config.razorpay.keyId,   // public key — safe to expose
        mode: config.razorpay.mode,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Company code lookup (for linking parties)
router.get('/lookup/:code', lookupByCode);

// Challan prefix management
router.post('/prefixes', restrictTo('owner', 'admin'), addPrefix);
router.delete('/prefixes/:name', restrictTo('owner', 'admin'), deletePrefix);
router.put('/party-prefix', restrictTo('owner', 'admin'), assignPartyPrefix);

export default router;
