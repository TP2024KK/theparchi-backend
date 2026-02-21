import mongoose from 'mongoose';

// Stores payment gateway keys set by super admin from the admin panel.
// Keys are never hardcoded — super admin enters them via UI.

const paymentGatewayConfigSchema = new mongoose.Schema(
  {
    gateway: {
      type: String,
      enum: ['razorpay'],
      default: 'razorpay',
      unique: true,
    },

    isActive: { type: Boolean, default: false },

    // Razorpay
    razorpay: {
      keyId: String,          // starts with rzp_live_ or rzp_test_
      keySecret: String,      // stored as-is (consider encrypting in production)
      webhookSecret: String,
      mode: { type: String, enum: ['test', 'live'], default: 'test' },
    },

    // Who last updated this config
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastTestedAt: Date,
    testStatus: { type: String, enum: ['untested', 'success', 'failed'], default: 'untested' },
  },
  { timestamps: true }
);

const PaymentGatewayConfig = mongoose.model('PaymentGatewayConfig', paymentGatewayConfigSchema);
export default PaymentGatewayConfig;
