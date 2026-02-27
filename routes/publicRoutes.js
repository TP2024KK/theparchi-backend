import express from 'express';
import { getPublicChallan, requestOTP, respondToChallan } from '../controllers/publicChallanController.js';

const router = express.Router();

// Standard email route — requires OTP
router.get('/challan/:token', getPublicChallan);
router.post('/challan/:token/request-otp', requestOTP);
router.post('/challan/:token/respond', respondToChallan);

// WhatsApp route — skip OTP, token auth is sufficient
router.get('/challan-wa/:token', (req, res, next) => { req.params.token = req.params.token; next(); }, getPublicChallan);
router.post('/challan-wa/:token/respond', (req, res, next) => { req.isWhatsApp = true; next(); }, respondToChallan);

export default router;
