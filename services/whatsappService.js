import axios from 'axios';
import WhatsAppConfig from '../models/WhatsAppConfig.js';

const META_API_VERSION = 'v22.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function getConfig() {
  return await WhatsAppConfig.findOne({ isActive: true });
}

export async function sendWhatsAppMessage({ to, templateName, languageCode = 'en_US', components = [], companyConfig = null }) {
  try {
    let phoneNumberId, accessToken;

    if (companyConfig?.ownApiEnabled && companyConfig?.phoneNumberId && companyConfig?.accessToken) {
      phoneNumberId = companyConfig.phoneNumberId;
      accessToken = companyConfig.accessToken;
    } else {
      const config = await getConfig();
      if (!config) throw new Error('WhatsApp not configured.');
      phoneNumberId = config.phoneNumberId;
      accessToken = config.accessToken;
    }

    const cleanPhone = to.replace(/\D/g, '');
    const phone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components })
      }
    };

    console.log('WhatsApp payload:', JSON.stringify(payload));

    const response = await axios.post(
      `${META_API_BASE}/${phoneNumberId}/messages`,
      payload,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    return { success: true, messageId: response.data?.messages?.[0]?.id };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('WhatsApp send error:', errMsg);
    return { success: false, error: errMsg };
  }
}

export async function sendChallanWhatsApp({ challan, party, company, publicToken }) {
  if (!party?.phone) return { success: false, error: 'Party has no phone number' };

  const config = await getConfig();
  if (!config?.isActive) return { success: false, error: 'WhatsApp not enabled' };

  const template = config.templates?.find(t => t.trigger === 'challan_sent' && t.isActive);
  if (!template) return { success: false, error: 'No active template for challan_sent' };

  // Template structure:
  // Header: text with {{Order Status}} variable
  // Body: {{customer_name}}, {{challan_number}}, {{company_name}}
  // Button: CTA url with dynamic token
  const components = [
    {
      type: 'header',
      parameters: [
        { type: 'text', text: challan.challanNumber }
      ]
    },
    {
      type: 'body',
      parameters: [
        { type: 'text', text: party.name },
        { type: 'text', text: challan.challanNumber },
        { type: 'text', text: company.name }
      ]
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        { type: 'text', text: publicToken }
      ]
    }
  ];

  return await sendWhatsAppMessage({
    to: party.phone,
    templateName: template.templateName,
    languageCode: template.languageCode || 'en_US',
    components
  });
}
