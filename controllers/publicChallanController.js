import Challan from '../models/Challan.js';
import Party from '../models/Party.js';
import crypto from 'crypto';
import { sendChallanEmail, sendOTPEmail } from '../utils/email.js';

// @desc  View challan publicly (no auth needed)
// @route GET /api/public/challan/:token
export const getPublicChallan = async (req, res) => {
  try {
    const challan = await Challan.findOne({ publicToken: req.params.token })
      .populate('party', 'name email phone address gstNumber')
      .populate('company', 'name email phone address gstNumber bankDetails settings');

    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found or link expired' });
    }

    res.json({
      success: true,
      data: {
        challan: {
          _id: challan._id,
          challanNumber: challan.challanNumber,
          challanDate: challan.challanDate,
          items: challan.items,
          subtotal: challan.subtotal,
          totalGST: challan.totalGST,
          grandTotal: challan.grandTotal,
          notes: challan.notes,
          status: challan.status,
          partyResponse: challan.partyResponse,
          party: challan.party,
          company: challan.company,
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc  Request OTP to respond to challan
// @route POST /api/public/challan/:token/request-otp
export const requestOTP = async (req, res) => {
  try {
    const challan = await Challan.findOne({ publicToken: req.params.token })
      .populate('party', 'name email phone');

    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    if (challan.partyResponse?.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Challan already ${challan.partyResponse.status}` });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    challan.partyOTP = { code: otp, expiresAt };
    await challan.save();

    // Send OTP to party email
    const partyEmail = challan.party.email || challan.emailSentTo;
    if (partyEmail) {
      await sendOTPEmail(partyEmail, challan.party.name, otp, challan.challanNumber);
    }

    res.json({
      success: true,
      message: `OTP sent to ${partyEmail ? partyEmail.replace(/(.{2}).*(@.*)/, '$1****$2') : 'registered email'}`,
      email: partyEmail ? partyEmail.replace(/(.{2}).*(@.*)/, '$1****$2') : ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

// @desc  Respond to challan (accept/reject) with OTP
// @route POST /api/public/challan/:token/respond
export const respondToChallan = async (req, res) => {
  try {
    const { otp, action, remarks } = req.body; // action: 'accepted' or 'rejected'

    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const challan = await Challan.findOne({ publicToken: req.params.token })
      .populate('party', 'name email')
      .populate('company', 'name email');

    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    if (challan.partyResponse?.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Challan already ${challan.partyResponse.status}` });
    }

    // Verify OTP
    if (!challan.partyOTP?.code || challan.partyOTP.code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (new Date() > challan.partyOTP.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    // Update challan
    challan.partyResponse = {
      status: action,
      respondedAt: new Date(),
      remarks: remarks || ''
    };
    challan.partyOTP = undefined; // Clear OTP after use

    // Update challan status if accepted
    if (action === 'accepted') {
      challan.status = 'sent'; // Keep as sent
    } else if (action === 'rejected') {
      challan.status = 'returned';
    }

    await challan.save();

    // Notify company owner by email
    try {
      const { sendChallanResponseEmail } = await import('../utils/email.js');
      await sendChallanResponseEmail(
        challan.company.email,
        challan.company.name,
        challan.party.name,
        challan.challanNumber,
        action,
        remarks
      );
    } catch (e) {
      console.error('Notification email failed:', e);
    }

    res.json({
      success: true,
      message: `Challan ${action} successfully!`,
      data: { action, challanNumber: challan.challanNumber }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
