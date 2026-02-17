import Challan from '../models/Challan.js';
import Company from '../models/Company.js';
import Party from '../models/Party.js';
import User from '../models/User.js';
import TeamMember from '../models/TeamMember.js';
import { sendChallanEmail } from '../utils/email.js';
import { createNotification } from '../utils/notify.js';
import crypto from 'crypto';

// Helper: calculate totals from items
const calcTotals = (items) => {
  let subtotal = 0, totalGST = 0;
  const processed = items.map(item => {
    const amount = item.quantity * item.rate;
    const gstAmount = (amount * (item.gstRate || 0)) / 100;
    subtotal += amount;
    totalGST += gstAmount;
    return { ...item, amount, gstAmount };
  });
  return { items: processed, subtotal, totalGST, grandTotal: subtotal + totalGST };
};

// Helper: check if user can edit challan
const canEdit = (challan, userId) => {
  const editableStatuses = ['draft', 'created', 'rejected'];
  if (!editableStatuses.includes(challan.status)) return false;
  return challan.createdBy.toString() === userId.toString() ||
    challan.sfpAssignedTo?.toString() === userId.toString();
};

// Helper: get user permissions
const getUserPerms = async (userId, companyId) => {
  const company = await Company.findById(companyId);
  if (company.owner?.toString() === userId.toString()) return { isOwner: true, all: true };
  const member = await TeamMember.findOne({ user: userId, company: companyId });
  return member?.permissions || {};
};

// @desc  Create challan (draft, created, or send directly)
// @route POST /api/challans
export const createChallan = async (req, res, next) => {
  try {
    const { party, challanDate, items, notes, action = 'draft' } = req.body;
    // action: 'draft' | 'save' (created) | 'send' (created+sent)

    const perms = await getUserPerms(req.user.id, req.user.company);
    if (action === 'send' && !perms.all && !perms.canSendChallan) {
      return res.status(403).json({ success: false, message: 'No permission to send challans' });
    }

    const company = await Company.findById(req.user.company);
    const challanNumber = `${company.settings.challanPrefix}-${company.settings.nextChallanNumber}`;
    const { items: processedItems, subtotal, totalGST, grandTotal } = calcTotals(items);

    let status = action === 'draft' ? 'draft' : action === 'send' ? 'sent' : 'created';

    const challanData = {
      company: req.user.company,
      challanNumber,
      party,
      challanDate: challanDate || Date.now(),
      items: processedItems,
      subtotal, totalGST, grandTotal, notes,
      createdBy: req.user.id,
      status,
      sfpTrail: [{ action: 'created', by: req.user.id, at: new Date() }]
    };

    // If sending, generate token and send email
    if (action === 'send') {
      challanData.publicToken = crypto.randomBytes(32).toString('hex');
      challanData.emailSentAt = new Date();
    }

    const challan = await Challan.create(challanData);
    company.settings.nextChallanNumber += 1;
    await Company.updateOne({ _id: company._id }, { 'settings.nextChallanNumber': company.settings.nextChallanNumber });

    await challan.populate('party');
    await challan.populate('createdBy', 'name email');

    // Send email if action is send
    if (action === 'send') {
      const partyDoc = await Party.findById(party);
      if (partyDoc?.email) {
        challan.emailSentTo = partyDoc.email;
        await Challan.updateOne({ _id: challan._id }, { emailSentTo: partyDoc.email });
        sendChallanEmail(challan, partyDoc, company, req.user).catch(e => console.error('Email failed:', e));
      }
    }

    res.status(201).json({ success: true, message: `Challan ${status}!`, data: challan });
  } catch (error) { next(error); }
};

// @desc  Get all challans
// @route GET /api/challans
export const getChallans = async (req, res, next) => {
  try {
    const { status, party, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = { company: req.user.company };
    if (status) query.status = status;
    if (party) query.party = party;
    if (startDate || endDate) {
      query.challanDate = {};
      if (startDate) query.challanDate.$gte = new Date(startDate);
      if (endDate) query.challanDate.$lte = new Date(endDate);
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [challans, total] = await Promise.all([
      Challan.find(query)
        .populate('party', 'name email phone')
        .populate('createdBy', 'name')
        .populate('sfpAssignedTo', 'name')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      Challan.countDocuments(query)
    ]);
    res.json({ success: true, data: challans, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) { next(error); }
};

// @desc  Get single challan
// @route GET /api/challans/:id
export const getChallan = async (req, res, next) => {
  try {
    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company })
      .populate('party')
      .populate('createdBy', 'name email')
      .populate('sfpAssignedTo', 'name email')
      .populate('sfpTrail.by', 'name')
      .populate('sfpTrail.to', 'name');
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    res.json({ success: true, data: challan });
  } catch (error) { next(error); }
};

// @desc  Update challan (only draft/created/rejected)
// @route PUT /api/challans/:id
export const updateChallan = async (req, res, next) => {
  try {
    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company });
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    if (!canEdit(challan, req.user.id)) {
      return res.status(403).json({ success: false, message: `Cannot edit challan with status: ${challan.status}` });
    }

    const { party, challanDate, items, notes, action = 'save' } = req.body;
    const { items: processedItems, subtotal, totalGST, grandTotal } = calcTotals(items);

    const perms = await getUserPerms(req.user.id, req.user.company);
    if (action === 'send' && !perms.all && !perms.canSendChallan) {
      return res.status(403).json({ success: false, message: 'No permission to send challans' });
    }

    let newStatus = action === 'draft' ? 'draft' : action === 'send' ? 'sent' : 'created';

    // If rejected and resending - same challan number
    const isResend = challan.status === 'rejected' && action === 'send';

    const updateData = {
      party, challanDate, notes,
      items: processedItems, subtotal, totalGST, grandTotal,
      status: newStatus,
      $push: { sfpTrail: { action: isResend ? 'sent_to_party' : 'edited', by: req.user.id, at: new Date() } }
    };

    if (isResend) {
      updateData.resentCount = (challan.resentCount || 0) + 1;
      updateData.lastResentAt = new Date();
      updateData.publicToken = crypto.randomBytes(32).toString('hex');
      updateData.emailSentAt = new Date();
      // Clear previous rejection
      updateData['partyResponse.status'] = 'pending';
      updateData['partyResponse.remarks'] = '';
    }

    if (action === 'send' && !isResend) {
      updateData.publicToken = crypto.randomBytes(32).toString('hex');
      updateData.emailSentAt = new Date();
    }

    await Challan.updateOne({ _id: challan._id }, updateData);
    const updated = await Challan.findById(challan._id).populate('party').populate('createdBy', 'name');

    // Send email if sending
    if (action === 'send') {
      const company = await Company.findById(req.user.company);
      const partyDoc = await Party.findById(party || challan.party);
      if (partyDoc?.email) {
        await Challan.updateOne({ _id: challan._id }, { emailSentTo: partyDoc.email });
        sendChallanEmail(updated, partyDoc, company, req.user).catch(e => console.error('Email failed:', e));
      }
    }

    res.json({ success: true, message: `Challan ${isResend ? 'resent' : newStatus}!`, data: updated });
  } catch (error) { next(error); }
};

// @desc  Send challan to party (from created status)
// @route POST /api/challans/:id/send
export const sendChallan = async (req, res, next) => {
  try {
    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company }).populate('party');
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    if (!['draft', 'created', 'rejected'].includes(challan.status)) {
      return res.status(400).json({ success: false, message: 'Challan cannot be sent in current status' });
    }

    const perms = await getUserPerms(req.user.id, req.user.company);
    if (!perms.all && !perms.canSendChallan) {
      return res.status(403).json({ success: false, message: 'No permission to send challans' });
    }

    const isResend = challan.status === 'rejected';
    const token = crypto.randomBytes(32).toString('hex');

    await Challan.updateOne({ _id: challan._id }, {
      status: 'sent',
      publicToken: token,
      emailSentAt: new Date(),
      'partyResponse.status': 'pending',
      ...(isResend && { resentCount: (challan.resentCount || 0) + 1, lastResentAt: new Date() }),
      $push: { sfpTrail: { action: 'sent_to_party', by: req.user.id, at: new Date() } }
    });

    const company = await Company.findById(req.user.company);
    if (challan.party?.email) {
      const updated = await Challan.findById(challan._id).populate('party');
      await Challan.updateOne({ _id: challan._id }, { emailSentTo: challan.party.email });
      sendChallanEmail(updated, challan.party, company, req.user).catch(e => console.error('Email error:', e));
    }

    res.json({ success: true, message: isResend ? 'Challan resent successfully!' : 'Challan sent successfully!' });
  } catch (error) { next(error); }
};

// @desc  SFP - Send challan internally for processing
// @route POST /api/challans/:id/sfp
export const sfpChallan = async (req, res, next) => {
  try {
    const { toUserId, note } = req.body;
    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company });
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    if (!['draft', 'created'].includes(challan.status)) {
      return res.status(400).json({ success: false, message: 'Can only SFP draft or created challans' });
    }

    const perms = await getUserPerms(req.user.id, req.user.company);
    if (!perms.all && !perms.canSFP) {
      return res.status(403).json({ success: false, message: 'No SFP permission' });
    }

    await Challan.updateOne({ _id: challan._id }, {
      sfpStatus: 'pending',
      sfpAssignedTo: toUserId,
      $push: { sfpTrail: { action: 'sfp_sent', by: req.user.id, to: toUserId, note, at: new Date() } }
    });

    // Notify recipient
    const fromUser = await User.findById(req.user.id);
    await createNotification({
      company: req.user.company,
      type: 'challan_received',
      title: '📋 Challan assigned to you for processing',
      message: `${fromUser?.name} sent Challan ${challan.challanNumber} to you for processing${note ? '. Note: ' + note : ''}`,
      link: '/challans',
      relatedChallan: challan._id,
      fromCompany: fromUser?.name
    });

    const toUser = await User.findById(toUserId);
    res.json({ success: true, message: `Challan sent to ${toUser?.name} for processing!` });
  } catch (error) { next(error); }
};

// @desc  Get SFP recipients
// @route GET /api/challans/sfp-recipients
export const getSFPRecipients = async (req, res, next) => {
  try {
    // Get team members who can receive SFP
    const members = await TeamMember.find({
      company: req.user.company,
      status: 'active',
      user: { $ne: req.user.id },
      $or: [
        { 'permissions.canSendChallan': true },
        { 'permissions.canSFP': true },
        { role: { $in: ['owner', 'admin', 'manager'] } }
      ]
    }).populate('user', 'name email');

    // Also include company owner if they are not already in the list
    const company = await Company.findById(req.user.company);
    if (company.owner && company.owner.toString() !== req.user.id.toString()) {
      const ownerInList = members.some(m => m.user._id.toString() === company.owner.toString());
      if (!ownerInList) {
        const ownerUser = await User.findById(company.owner).select('name email');
        if (ownerUser) {
          members.unshift({ _id: company.owner, user: ownerUser, role: 'owner', permissions: { canSendChallan: true, canSFP: true } });
        }
      }
    }

    res.json({ success: true, data: members });
  } catch (error) { next(error); }
};

// @desc  Self accept/reject challan
// @route POST /api/challans/:id/self-action
export const selfActionChallan = async (req, res, next) => {
  try {
    const { action, remarks } = req.body;
    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company });
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });

    let newStatus;
    if (action === 'accept') newStatus = 'self_accepted';
    else if (action === 'reject') newStatus = 'rejected';
    else return res.status(400).json({ success: false, message: 'Invalid action' });

    await Challan.updateOne({ _id: challan._id }, {
      status: newStatus,
      'partyResponse.status': action === 'accept' ? 'accepted' : 'rejected',
      'partyResponse.respondedAt': new Date(),
      'partyResponse.remarks': remarks || '',
      'partyResponse.selfAction': true,
      'partyResponse.actionBy': req.user.id
    });

    res.json({ success: true, message: `Challan ${action}ed!` });
  } catch (error) { next(error); }
};

// @desc  Delete challan (only draft/created)
// @route DELETE /api/challans/:id
export const deleteChallan = async (req, res, next) => {
  try {
    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company });
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    if (!['draft', 'created'].includes(challan.status)) {
      return res.status(400).json({ success: false, message: 'Can only delete draft or created challans' });
    }
    await challan.deleteOne();
    res.json({ success: true, message: 'Challan deleted' });
  } catch (error) { next(error); }
};

// @desc  Get challan stats
// @route GET /api/challans/stats
export const getChallanStats = async (req, res, next) => {
  try {
    const stats = await Challan.aggregate([
      { $match: { company: req.user.company } },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }
    ]);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

// @desc  Fix old challan statuses (one-time migration)
// @route POST /api/challans/fix-statuses
export const fixChallanStatuses = async (req, res, next) => {
  try {
    // Fix: sent + partyResponse.accepted → accepted
    const r1 = await Challan.updateMany(
      { status: 'sent', 'partyResponse.status': 'accepted' },
      { $set: { status: 'accepted' } }
    );
    // Fix: sent + partyResponse.rejected → rejected (not returned!)  
    const r2 = await Challan.updateMany(
      { status: { $in: ['sent', 'returned'] }, 'partyResponse.status': 'rejected', 'partyResponse.selfAction': { $ne: true } },
      { $set: { status: 'rejected' } }
    );
    // Fix: self accepted
    const r3 = await Challan.updateMany(
      { status: 'sent', 'partyResponse.status': 'accepted', 'partyResponse.selfAction': true },
      { $set: { status: 'self_accepted' } }
    );

    res.json({ success: true, message: 'Statuses fixed!', fixed: { accepted: r1.modifiedCount, rejected: r2.modifiedCount, selfAccepted: r3.modifiedCount } });
  } catch (error) { next(error); }
};
