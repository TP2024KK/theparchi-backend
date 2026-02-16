import express from 'express';
import { getPublicChallan, requestOTP, respondToChallan } from '../controllers/publicChallanController.js';

const router = express.Router();

router.get('/challan/:token', getPublicChallan);
router.post('/challan/:token/request-otp', requestOTP);
router.post('/challan/:token/respond', respondToChallan);

export default router;
