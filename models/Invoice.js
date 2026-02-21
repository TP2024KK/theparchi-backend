import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    // Invoice number: INV-2024-0001
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    // Snapshot of billing info at invoice time
    billingSnapshot: {
      companyName: String,
      legalName: String,
      gstNumber: String,
      address: String,
      email: String,
    },

    type: {
      type: String,
      enum: ['subscription', 'whatsapp_credits'],
      required: true,
    },

    // Subscription invoice details
    plan: String,                    // 'growth' / 'pro'
    billingCycle: String,            // 'monthly' / 'yearly'
    periodStart: Date,
    periodEnd: Date,

    // WhatsApp credit purchase details
    whatsappPack: String,            // 'popular' / 'business' etc
    whatsappCredits: Number,

    // Pricing (all in INR)
    baseAmount: { type: Number, required: true },
    gstRate: { type: Number, default: 18 },
    gstAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },

    // Payment details
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'manual', 'free'],
      default: 'razorpay',
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt: Date,

    // Manual payment (super admin marks as paid)
    markedPaidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    markedPaidNote: String,

    // Refund
    refundedAt: Date,
    refundReason: String,
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invoiceSchema.index({ company: 1, createdAt: -1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ paymentStatus: 1 });
invoiceSchema.index({ 'razorpayOrderId': 1 });

// Auto-generate invoice number before saving
invoiceSchema.pre('save', async function (next) {
  if (this.isNew && !this.invoiceNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Invoice').countDocuments() + 1;
    this.invoiceNumber = `INV-${year}-${String(count).padStart(4, '0')}`;
  }
  next();
});

const Invoice = mongoose.model('Invoice', invoiceSchema);
export default Invoice;
