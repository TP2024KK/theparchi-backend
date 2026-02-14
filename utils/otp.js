import crypto from 'crypto';

/**
 * Generate a random 6-digit OTP
 */
export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Calculate OTP expiry time
 */
export const getOTPExpiry = () => {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Verify if OTP is still valid
 */
export const isOTPValid = (expiryDate) => {
  return new Date() < new Date(expiryDate);
};
