import express from 'express';
import {
  signup,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);

export default router;
