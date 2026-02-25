import WhatsAppConfig from '../models/WhatsAppConfig.js';
import Challan from '../models/Challan.js';
import Company from '../models/Company.js';

// ── GET — Webhook verification (Meta calls this once to verify) ───────────────
export const verifyWebhook = async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const config = await WhatsAppConfig.findOne({});
    const verifyToken = config?.webhookVerifyToken;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }
    res.status(403).json({ success: false, message: 'Forbidden' });
  } catch (error) {
    res.status(403).json({ success: false, message: 'Verification failed' });
  }
};

// ── POST — Receive incoming messages/events from Meta ────────────────────────
export const receiveWebhook = async (req, res) => {
  try {
    // Always respond 200 immediately so Meta doesn't retry
    res.status(200).json({ success: true });

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value?.messages || [];
        const statuses = value?.statuses || [];

        // Handle incoming messages (button replies = accept/reject)
        for (const msg of messages) {
          if (msg.type === 'button') {
            await handleButtonReply(msg);
          } else if (msg.type === 'interactive') {
            await handleInteractiveReply(msg);
          }
        }

        // Handle delivery status updates (optional logging)
        for (const status of statuses) {
          console.log(`WhatsApp message ${status.id} status: ${status.status}`);
        }
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }
};

// ── Handle button reply (Quick Reply buttons) ─────────────────────────────────
async function handleButtonReply(msg) {
  try {
    const buttonPayload = msg.button?.payload || '';
    const fromPhone = msg.from;

    // Payload format: "ACCEPT:publicToken" or "REJECT:publicToken"
    const [action, publicToken] = buttonPayload.split(':');
    if (!publicToken) return;

    const challan = await Challan.findOne({ publicToken }).populate('company');
    if (!challan) {
      console.log('Webhook: challan not found for token', publicToken);
      return;
    }

    if (action === 'ACCEPT' && challan.status === 'sent') {
      await Challan.updateOne({ _id: challan._id }, {
        status: 'accepted',
        'partyResponse.status': 'accepted',
        'partyResponse.respondedAt': new Date(),
        'partyResponse.channel': 'whatsapp',
        $push: { sfpTrail: { action: 'accepted_by_party', by: null, at: new Date(), note: 'Via WhatsApp' } }
      });
      console.log(`✅ Challan ${challan.challanNumber} accepted via WhatsApp from ${fromPhone}`);
    } else if (action === 'REJECT' && challan.status === 'sent') {
      await Challan.updateOne({ _id: challan._id }, {
        status: 'rejected',
        'partyResponse.status': 'rejected',
        'partyResponse.respondedAt': new Date(),
        'partyResponse.channel': 'whatsapp',
        $push: { sfpTrail: { action: 'rejected_by_party', by: null, at: new Date(), note: 'Via WhatsApp' } }
      });
      console.log(`❌ Challan ${challan.challanNumber} rejected via WhatsApp from ${fromPhone}`);
    }
  } catch (error) {
    console.error('Button reply handling error:', error);
  }
}

// ── Handle interactive reply (List/Button interactive messages) ───────────────
async function handleInteractiveReply(msg) {
  // Handle interactive button replies same as quick replies
  const replyId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || '';
  const fromPhone = msg.from;

  if (!replyId) return;

  const [action, publicToken] = replyId.split(':');
  if (!publicToken) return;

  const challan = await Challan.findOne({ publicToken });
  if (!challan) return;

  if (action === 'ACCEPT' && challan.status === 'sent') {
    await Challan.updateOne({ _id: challan._id }, {
      status: 'accepted',
      'partyResponse.status': 'accepted',
      'partyResponse.respondedAt': new Date(),
      'partyResponse.channel': 'whatsapp',
    });
  } else if (action === 'REJECT' && challan.status === 'sent') {
    await Challan.updateOne({ _id: challan._id }, {
      status: 'rejected',
      'partyResponse.status': 'rejected',
      'partyResponse.respondedAt': new Date(),
      'partyResponse.channel': 'whatsapp',
    });
  }
}
