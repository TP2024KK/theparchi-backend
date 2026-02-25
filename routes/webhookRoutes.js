import express from 'express';
import { verifyWebhook, receiveWebhook } from '../controllers/webhookController.js';

const router = express.Router();

// Meta webhook verification — GET
router.get('/whatsapp', verifyWebhook);

// Meta webhook events — POST
router.post('/whatsapp', receiveWebhook);

export default router;
