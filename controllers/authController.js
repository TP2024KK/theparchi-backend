import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { generateToken } from '../utils/jwt.js';
import { generateOTP, getOTPExpiry, isOTPValid } from '../utils/otp.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../utils/email.js';

/**
 * @desc    Register new company and owner
 * @route   POST /api/auth/signup
 * @access  Public
 */
export const signup = async (req, res, next) => {
  try {
    const { name, email, password, companyName, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create company first
    const company = await Company.create({
      name: companyName,
      email: email,
      phone: phone,
      owner: null // Will update after creating user
    });

    // Create owner user
    const user = await User.create({
      name,
      email,
      password,
      phone,
      company: company._id,
      role: 'owner',
      permissions: [] // Owner has all permissions by default
    });

    // Update company with owner reference
    company.owner = user._id;
    await company.save();

    // Generate token
    const token = generateToken(user._id);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, name, companyName).catch(err => 
      console.error('Welcome email failed:', err)
    );

    // Use updateOne to bypass pre-save hook (avoid re-hashing password)
    await User.updateOne({ _id: user._id }, { lastLogin: new Date() });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: {
            id: company._id,
            name: company.name
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check if user exists (include password for comparison)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password').populate('company', 'name');

    if (!user) {
      console.log('Login failed: user not found for email:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Your account has been deactivated. Please contact your administrator.' });
    }

    if (!user.company) {
      console.log('Login failed: user has no company:', user._id);
      return res.status(401).json({ success: false, message: 'Account not linked to any company. Contact your admin.' });
    }

    const isPasswordCorrect = await user.comparePassword(password);
    console.log('Login attempt for:', email, '| password match:', isPasswordCorrect);

    if (!isPasswordCorrect) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Use updateOne to bypass pre-save hook (avoid re-hashing password)
    await User.updateOne({ _id: user._id }, { lastLogin: new Date() });

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: user.company ? {
            id: user.company._id,
            name: user.company.name
          } : null
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('company', 'name');

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        permissions: user.permissions,
        company: {
          id: user.company._id,
          name: user.company.name
        },
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Request password reset OTP
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists or not (security)
      return res.status(200).json({
        success: true,
        message: 'If the email exists, you will receive an OTP shortly'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    // Save OTP to user (select fields explicitly since they're not selected by default)
    user.passwordResetOTP = otp;
    user.passwordResetExpires = otpExpiry;
    await user.save();

    // Send email
    await sendPasswordResetEmail(email, otp, user.name);

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using OTP
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, OTP, and new password'
      });
    }

    // Find user with OTP (include hidden fields)
    const user = await User.findOne({ email })
      .select('+passwordResetOTP +passwordResetExpires');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request'
      });
    }

    // Check if OTP exists
    if (!user.passwordResetOTP) {
      return res.status(400).json({
        success: false,
        message: 'No OTP requested. Please request a new OTP.'
      });
    }

    // Verify OTP
    if (user.passwordResetOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Check if OTP is expired
    if (!isOTPValid(user.passwordResetExpires)) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // Reset password - hash manually then use updateOne to bypass pre-save hook
    // (same pattern as login/signup - user.save() would double-hash the password)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.updateOne(
      { _id: user._id },
      {
        password: hashedPassword,
        passwordResetOTP: undefined,
        passwordResetExpires: undefined
      }
    );

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change password (when logged in)
 * @route   POST /api/auth/change-password
 * @access  Private
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    // Verify current password
    const isPasswordCorrect = await user.comparePassword(currentPassword);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};
