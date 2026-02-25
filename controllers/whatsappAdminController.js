import WhatsAppConfig from '../models/WhatsAppConfig.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';

// ── Get config ────────────────────────────────────────────────────────────────
export const getWhatsAppConfig = async (req, res, next) => {
  try {
    let config = await WhatsAppConfig.findOne({});
    if (!config) {
      // Create default config
      config = await WhatsAppConfig.create({
        isActive: false,
        templates: [
          { trigger: 'challan_sent', templateName: 'send_document_all', languageCode: 'en_US', variables: ['party_name', 'challan_number', 'company_name'], isActive: true },
          { trigger: 'challan_accepted', templateName: '', languageCode: 'en_US', variables: ['challan_number', 'party_name'], isActive: false },
          { trigger: 'challan_rejected', templateName: '', languageCode: 'en_US', variables: ['challan_number', 'party_name', 'reason'], isActive: false },
          { trigger: 'return_challan_sent', templateName: '', languageCode: 'en_US', variables: ['party_name', 'return_number', 'amount'], isActive: false },
          { trigger: 'payment_received', templateName: '', languageCode: 'en_US', variables: ['party_name', 'amount', 'challan_number'], isActive: false },
          { trigger: 'payment_reminder', templateName: '', languageCode: 'en_US', variables: ['party_name', 'amount', 'due_date'], isActive: false },
          { trigger: 'note_added', templateName: '', languageCode: 'en_US', variables: ['party_name', 'challan_number', 'note'], isActive: false },
          { trigger: 'overdue_reminder', templateName: '', languageCode: 'en_US', variables: ['party_name', 'amount', 'days_overdue'], isActive: false },
        ]
      });
    }
    // Mask access token for display
    const configObj = config.toObject();
    if (configObj.accessToken) {
      configObj.accessTokenMasked = '•'.repeat(20) + configObj.accessToken.slice(-6);
      delete configObj.accessToken;
    }
    res.json({ success: true, data: configObj });
  } catch (error) { next(error); }
};

// ── Update credentials ────────────────────────────────────────────────────────
export const updateWhatsAppCredentials = async (req, res, next) => {
  try {
    const { phoneNumberId, accessToken, businessAccountId, webhookVerifyToken, phoneNumber, isActive } = req.body;

    const update = {};
    if (phoneNumberId !== undefined) update.phoneNumberId = phoneNumberId;
    if (accessToken !== undefined && accessToken !== '') update.accessToken = accessToken;
    if (businessAccountId !== undefined) update.businessAccountId = businessAccountId;
    if (webhookVerifyToken !== undefined) update.webhookVerifyToken = webhookVerifyToken;
    if (phoneNumber !== undefined) update.phoneNumber = phoneNumber;
    if (isActive !== undefined) update.isActive = isActive;
    update.updatedBy = req.user.id;

    const config = await WhatsAppConfig.findOneAndUpdate({}, { $set: update }, { new: true, upsert: true });

    res.json({ success: true, message: 'WhatsApp credentials updated', data: { isActive: config.isActive } });
  } catch (error) { next(error); }
};

// ── Update templates ──────────────────────────────────────────────────────────
export const updateTemplate = async (req, res, next) => {
  try {
    const { trigger, templateName, languageCode, variables, isActive, notes } = req.body;

    const config = await WhatsAppConfig.findOne({});
    if (!config) return res.status(404).json({ success: false, message: 'WhatsApp not configured' });

    const tIdx = config.templates.findIndex(t => t.trigger === trigger);
    if (tIdx === -1) {
      config.templates.push({ trigger, templateName, languageCode: languageCode || 'en_US', variables: variables || [], isActive: isActive !== false, notes });
    } else {
      if (templateName !== undefined) config.templates[tIdx].templateName = templateName;
      if (languageCode !== undefined) config.templates[tIdx].languageCode = languageCode;
      if (variables !== undefined) config.templates[tIdx].variables = variables;
      if (isActive !== undefined) config.templates[tIdx].isActive = isActive;
      if (notes !== undefined) config.templates[tIdx].notes = notes;
    }

    await config.save();
    res.json({ success: true, message: 'Template updated' });
  } catch (error) { next(error); }
};

// ── Test send ─────────────────────────────────────────────────────────────────
export const testWhatsApp = async (req, res, next) => {
  try {
    const { phone, templateName, variables } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    const config = await WhatsAppConfig.findOne({});
    if (!config?.accessToken) return res.status(400).json({ success: false, message: 'WhatsApp credentials not configured' });

    const result = await sendWhatsAppMessage({
      to: phone,
      templateName: templateName || 'hello_world',
      variables: variables || [],
      languageCode: 'en_US'
    });

    if (result.success) {
      res.json({ success: true, message: `Test message sent to ${phone}`, messageId: result.messageId });
    } else {
      res.status(400).json({ success: false, message: result.error });
    }
  } catch (error) { next(error); }
};
