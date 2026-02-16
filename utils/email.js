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

// Send challan to party
export const sendChallanEmail = async (toEmail, partyName, companyName, challanNumber, challanDate, grandTotal, publicLink, items) => {
  const itemRows = items.slice(0, 5).map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.itemName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity} ${item.unit}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">₹${Number(item.amount).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
        
        <!-- Header -->
        <div style="background:#1976d2;padding:25px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px">📋 New Delivery Challan</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">from ${companyName}</p>
        </div>

        <!-- Body -->
        <div style="padding:25px">
          <p style="font-size:15px;color:#333">Dear <strong>${partyName}</strong>,</p>
          <p style="color:#555;line-height:1.6">
            <strong>${companyName}</strong> has sent you a delivery challan. Please review the details below.
          </p>

          <!-- Challan Info Box -->
          <div style="background:#f0f4ff;border:1px solid #c3d4f7;border-radius:6px;padding:15px;margin:20px 0">
            <table style="width:100%;font-size:14px">
              <tr>
                <td style="color:#666;padding:4px 0">Challan Number:</td>
                <td style="font-weight:bold;color:#1976d2">${challanNumber}</td>
              </tr>
              <tr>
                <td style="color:#666;padding:4px 0">Date:</td>
                <td style="font-weight:bold">${challanDate}</td>
              </tr>
              <tr>
                <td style="color:#666;padding:4px 0">Grand Total:</td>
                <td style="font-weight:bold;font-size:18px;color:#1976d2">₹${Number(grandTotal).toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <!-- Items Preview -->
          <h3 style="color:#333;font-size:14px;margin-bottom:8px">Items Summary:</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:20px">
            <thead>
              <tr style="background:#1976d2;color:#fff">
                <th style="padding:8px 12px;text-align:left;font-size:12px">Item</th>
                <th style="padding:8px 12px;text-align:center;font-size:12px">Qty</th>
                <th style="padding:8px 12px;text-align:right;font-size:12px">Amount</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <!-- Action Buttons -->
          <div style="text-align:center;margin:25px 0">
            <a href="${publicLink}" style="display:inline-block;background:#1976d2;color:#fff;padding:14px 35px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;margin-bottom:10px">
              👁️ View Full Challan
            </a>
            <p style="color:#888;font-size:12px;margin-top:10px">
              Click the button to view the full challan and Accept or Reject it.
            </p>
          </div>

          <!-- Accept/Reject Note -->
          <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;padding:12px;margin-bottom:20px">
            <p style="margin:0;font-size:13px;color:#2e7d32">
              ✅ You can <strong>Accept</strong> or <strong>Reject</strong> this challan after OTP verification on the challan page.
            </p>
          </div>

          <p style="color:#888;font-size:12px;border-top:1px solid #eee;padding-top:15px;margin-top:20px">
            This challan was sent by ${companyName}. If you have questions, please contact them directly.<br>
            Powered by <strong>TheParchi</strong>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject: `Delivery Challan ${challanNumber} from ${companyName}`, html });
};

// Send OTP for challan verification
export const sendOTPEmail = async (toEmail, partyName, otp, challanNumber) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
      <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
        <h2 style="color:#1976d2;margin-top:0">🔐 Verification OTP</h2>
        <p>Dear <strong>${partyName}</strong>,</p>
        <p>Your OTP to verify and respond to Challan <strong>${challanNumber}</strong> is:</p>
        <div style="background:#f0f4ff;border:2px solid #1976d2;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
          <div style="font-size:36px;font-weight:bold;color:#1976d2;letter-spacing:8px">${otp}</div>
          <p style="color:#666;font-size:12px;margin:8px 0 0">Valid for 10 minutes only</p>
        </div>
        <p style="color:#888;font-size:12px">If you did not request this OTP, please ignore this email.</p>
        <p style="color:#888;font-size:12px">Powered by <strong>TheParchi</strong></p>
      </div>
    </body>
    </html>
  `;
  return sendEmail({ to: toEmail, subject: `OTP: ${otp} - Challan ${challanNumber} Verification`, html });
};

// Notify company when party responds
export const sendChallanResponseEmail = async (toEmail, companyName, partyName, challanNumber, action, remarks) => {
  const color = action === 'accepted' ? '#2e7d32' : '#c62828';
  const bg = action === 'accepted' ? '#e8f5e9' : '#ffebee';
  const icon = action === 'accepted' ? '✅' : '❌';

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
      <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
        <h2 style="color:${color};margin-top:0">${icon} Challan ${action.charAt(0).toUpperCase() + action.slice(1)}</h2>
        <div style="background:${bg};border-radius:6px;padding:15px;margin:15px 0">
          <p style="margin:0;font-size:15px;color:${color}">
            <strong>${partyName}</strong> has <strong>${action}</strong> Challan <strong>${challanNumber}</strong>
          </p>
          ${remarks ? `<p style="margin:8px 0 0;font-size:13px;color:#555">Remarks: ${remarks}</p>` : ''}
        </div>
        <p style="color:#888;font-size:12px">Login to TheParchi to view the updated status.</p>
      </div>
    </body>
    </html>
  `;
  return sendEmail({ to: toEmail, subject: `${icon} Challan ${challanNumber} ${action} by ${partyName}`, html });
};
