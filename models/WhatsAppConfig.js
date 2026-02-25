import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
  trigger: {
    type: String,
    enum: ['challan_sent', 'challan_accepted', 'challan_rejected', 'return_challan_sent', 'payment_received', 'payment_reminder', 'note_added', 'overdue_reminder'],
    required: true
  },
  templateName: { type: String, default: '' },
  languageCode: { type: String, default: 'en_US' },
  variables: [String], // description of variables e.g. ['party_name', 'challan_number', 'company_name']
  isActive: { type: Boolean, default: true },
  notes: String // admin notes about this template
});

const whatsAppConfigSchema = new mongoose.Schema({
  // TheParchi shared API credentials
  phoneNumberId: { type: String },
  accessToken: { type: String },
  businessAccountId: { type: String },
  webhookVerifyToken: { type: String },
  phoneNumber: { type: String }, // display e.g. +91 98687 13499

  // Feature toggle
  isActive: { type: Boolean, default: false },

  // Templates
  templates: [templateSchema],

  // Metadata
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('WhatsAppConfig', whatsAppConfigSchema);
