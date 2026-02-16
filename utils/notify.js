import Notification from '../models/Notification.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import { sendChallanResponseEmail } from './email.js';

// Create in-panel notification for a company
export const createNotification = async ({ company, type, title, message, link, relatedChallan, relatedReturnChallan, fromCompany }) => {
  try {
    await Notification.create({ company, type, title, message, link, relatedChallan, relatedReturnChallan, fromCompany });
  } catch (err) {
    console.error('Notification create error:', err.message);
  }
};

// Notify sender when party accepts/rejects challan from panel
export const notifyChallanResponse = async ({ challan, action, remarks, actingCompanyName }) => {
  try {
    const senderCompany = await Company.findById(challan.company);
    if (!senderCompany) return;

    const icon = action === 'accepted' ? '✅' : '❌';
    const title = `Challan ${action} by ${actingCompanyName}`;
    const message = `${actingCompanyName} has ${action} Challan ${challan.challanNumber}${remarks ? '. Remarks: ' + remarks : ''}`;

    // In-panel notification for sender
    await createNotification({
      company: challan.company,
      type: `challan_${action}`,
      title,
      message,
      link: '/challans',
      relatedChallan: challan._id,
      fromCompany: actingCompanyName
    });

    // Email to sender
    if (senderCompany.email) {
      await sendChallanResponseEmail(
        senderCompany.email,
        senderCompany.name,
        actingCompanyName,
        challan.challanNumber,
        action,
        remarks
      );
    }
  } catch (err) {
    console.error('notifyChallanResponse error:', err.message);
  }
};

// Notify sender when receiver creates return challan
export const notifyReturnChallanCreated = async ({ returnChallan, senderCompanyId, receiverCompanyName, originalChallanNumber }) => {
  try {
    const title = `Return Challan received from ${receiverCompanyName}`;
    const message = `${receiverCompanyName} has created Return Challan ${returnChallan.returnChallanNumber} against your Challan ${originalChallanNumber}`;

    await createNotification({
      company: senderCompanyId,
      type: 'return_challan_received',
      title,
      message,
      link: '/return-challans',
      relatedReturnChallan: returnChallan._id,
      fromCompany: receiverCompanyName
    });

    // Email sender company
    const senderCompany = await Company.findById(senderCompanyId);
    if (senderCompany?.email) {
      const { sendEmail } = await import('./email.js');
      // use generic notify
    }
  } catch (err) {
    console.error('notifyReturnChallanCreated error:', err.message);
  }
};

// Notify receiver when sender acknowledges return challan
export const notifyReturnAcknowledged = async ({ returnChallan, receiverCompanyId, senderCompanyName }) => {
  try {
    await createNotification({
      company: receiverCompanyId,
      type: 'return_challan_acknowledged',
      title: `Return Challan acknowledged by ${senderCompanyName}`,
      message: `${senderCompanyName} has acknowledged your Return Challan ${returnChallan.returnChallanNumber}`,
      link: '/received-challans',
      relatedReturnChallan: returnChallan._id,
      fromCompany: senderCompanyName
    });
  } catch (err) {
    console.error('notifyReturnAcknowledged error:', err.message);
  }
};
