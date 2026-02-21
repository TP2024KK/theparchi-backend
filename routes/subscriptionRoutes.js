import express from 'express';
import {
  getPlans, getStatus, createOrder, verifyPayment,
  createWhatsAppOrder, verifyWhatsAppPayment,
  handleWebhook, getInvoices, updateBillingInfo,
} from '../controllers/subscriptionController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public — no auth needed
router.get('/plans', getPlans);

// Razorpay webhook — needs raw body, no auth
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Protected routes
router.use(protect);

router.get('/status', getStatus);
router.get('/invoices', getInvoices);
router.put('/billing-info', updateBillingInfo);

// Subscription payment flow
router.post('/create-order', createOrder);
router.post('/verify-payment', verifyPayment);

// WhatsApp credits payment flow
router.post('/create-whatsapp-order', createWhatsAppOrder);
router.post('/verify-whatsapp-payment', verifyWhatsAppPayment);

export default router;
