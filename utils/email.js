import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send password reset OTP email
 */
export const sendPasswordResetEmail = async (email, otp, userName) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: 'Password Reset OTP - TheParchi',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset OTP</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
            <h1 style="color: #1976d2; margin-top: 0;">Password Reset Request</h1>
            <p>Hi ${userName},</p>
            <p>You requested to reset your password for TheParchi. Use the OTP below to proceed:</p>
            
            <div style="background-color: #fff; border: 2px dashed #1976d2; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
              <h2 style="color: #1976d2; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h2>
            </div>
            
            <p><strong>This OTP will expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.</strong></p>
            
            <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666;">
              This is an automated email from TheParchi. Please do not reply to this email.
            </p>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('Email send error:', error);
      throw new Error('Failed to send email');
    }

    return data;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

/**
 * Send welcome email
 */
export const sendWelcomeEmail = async (email, userName, companyName) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: 'Welcome to TheParchi!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px;">
            <h1 style="color: #1976d2; margin-top: 0;">Welcome to TheParchi! 🎉</h1>
            <p>Hi ${userName},</p>
            <p>Your account for <strong>${companyName}</strong> has been successfully created!</p>
            <p>You can now start creating challans, managing parties, and organizing your business documents.</p>
            
            <a href="${process.env.FRONTEND_URL}/login" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
              Login to TheParchi
            </a>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666;">
              This is an automated email from TheParchi.
            </p>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('Email send error:', error);
      // Don't throw error for welcome email - it's not critical
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return null;
  }
};
