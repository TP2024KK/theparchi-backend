import axios from 'axios';
import WhatsAppConfig from '../models/WhatsAppConfig.js';

const META_API_VERSION = 'v22.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Get active config ─────────────────────────────────────────────────────────
async function getConfig() {
  const config = await WhatsAppConfig.findOne({ isActive: true });
  return config;
}

// ── Send a WhatsApp template message ─────────────────────────────────────────
export async function sendWhatsAppMessage({ to, templateName, variables = [], languageCode = 'en_US', documentUrl = null, documentName = null, companyConfig = null }) {
  try {
    // Use company's own config if provided, else use TheParchi shared config
    let phoneNumberId, accessToken;

    if (companyConfig?.ownApiEnabled && companyConfig?.phoneNumberId && companyConfig?.accessToken) {
      phoneNumberId = companyConfig.phoneNumberId;
      accessToken = companyConfig.accessToken;
    } else {
      const config = await getConfig();
      if (!config) throw new Error('WhatsApp not configured. Please add credentials in SuperAdmin.');
      phoneNumberId = config.phoneNumberId;
      accessToken = config.accessToken;
    }

    // Clean phone number — ensure it has country code, no + or spaces
    const cleanPhone = to.replace(/\D/g, '');
    const phone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    // Build components
    const components = [];

    // Header (document) if provided
    if (documentUrl) {
      components.push({
        type: 'header',
        parameters: [{
          type: 'document',
          document: {
            link: documentUrl,
            filename: documentName || 'challan.pdf'
          }
        }]
      });
    }

    // Body variables
    if (variables.length > 0) {
      components.push({
        type: 'body',
        parameters: variables.map(v => ({ type: 'text', text: String(v) }))
      });
    }

    // Build request payload
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components.length > 0 ? components : undefined
      }
    };

    const response = await axios.post(
      `${META_API_BASE}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return { success: true, messageId: response.data?.messages?.[0]?.id };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('WhatsApp send error:', errMsg);
    return { success: false, error: errMsg };
  }
}

// ── Send challan to party ─────────────────────────────────────────────────────
export async function sendChallanWhatsApp({ challan, party, company, publicToken }) {
  if (!party?.phone) return { success: false, error: 'Party has no phone number' };

  const config = await getConfig();
  if (!config?.isActive) return { success: false, error: 'WhatsApp not enabled' };

  // Get template for 'challan_sent' trigger
  const template = config.templates?.find(t => t.trigger === 'challan_sent' && t.isActive);
  if (!template) return { success: false, error: 'No active template for challan_sent' };

  // Build public accept/reject URL
  const acceptUrl = `https://theparchi-frontend1.vercel.app/challan/public/${publicToken}`;

  // Variables: {{1}} = party name, {{2}} = challan number, {{3}} = company name
  const variables = [
    party.name,
    challan.challanNumber,
    company.name
  ];

  // Use a sample PDF as placeholder document header
  // Template requires document in header — use a hosted sample PDF
  const samplePdfUrl = 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf';

  const result = await sendWhatsAppMessage({
    to: party.phone,
    templateName: template.templateName,
    languageCode: template.languageCode || 'en_US',
    variables,
    documentUrl: samplePdfUrl,
    documentName: `${challan.challanNumber}.pdf`,
  });

  return result;
}
