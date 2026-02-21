import PaymentGatewayConfig from '../models/PaymentGatewayConfig.js';
import crypto from 'crypto';

// ─── Get Razorpay instance (keys come from DB, set by super admin) ────────────
// We dynamically import Razorpay so the app doesn't crash if keys aren't set yet.

export const getRazorpayInstance = async () => {
  const config = await PaymentGatewayConfig.findOne({ gateway: 'razorpay', isActive: true });
  if (!config?.razorpay?.keyId || !config?.razorpay?.keySecret) {
    throw new Error('Razorpay is not configured yet. Please add keys in Super Admin → Payment Settings.');
  }
  const Razorpay = (await import('razorpay')).default;
  return new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
  });
};

export const getRazorpayConfig = async () => {
  const config = await PaymentGatewayConfig.findOne({ gateway: 'razorpay' });
  return config || null;
};

// ─── Create Razorpay order ────────────────────────────────────────────────────
export const createRazorpayOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
  const razorpay = await getRazorpayInstance();
  const order = await razorpay.orders.create({
    amount: amount * 100, // Razorpay takes paise
    currency,
    receipt,
    notes,
  });
  return order;
};

// ─── Verify Razorpay payment signature ───────────────────────────────────────
export const verifyRazorpaySignature = async ({ orderId, paymentId, signature }) => {
  const config = await PaymentGatewayConfig.findOne({ gateway: 'razorpay', isActive: true });
  if (!config?.razorpay?.keySecret) throw new Error('Razorpay not configured');

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body)
    .digest('hex');

  return expectedSignature === signature;
};

// ─── Verify Razorpay webhook signature ───────────────────────────────────────
export const verifyWebhookSignature = async (rawBody, signature) => {
  const config = await PaymentGatewayConfig.findOne({ gateway: 'razorpay' });
  if (!config?.razorpay?.webhookSecret) return false;

  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');

  return expectedSignature === signature;
};
