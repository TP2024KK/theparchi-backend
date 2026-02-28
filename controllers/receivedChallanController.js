import Challan from '../models/Challan.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import ReturnChallan from '../models/ReturnChallan.js';
import { notifyChallanResponse, notifyReturnChallanCreated } from '../utils/notify.js';

// Helper: find company of logged in user
const getUserCompany = async (userId) => {
  const user = await User.findById(userId).populate('company');
  return user?.company;
};

// @desc  Get challans received by this company (party email matches company email or user email)
// @route GET /api/received-challans
export const getReceivedChallans = async (req, res, next) => {
  try {
    const myCompany = await Company.findById(req.user.company);
    const myUser = await User.findById(req.user.id);

    // Match by company email OR logged-in user email
    const emails = [myCompany?.email, myUser?.email].filter(Boolean);

    const challans = await Challan.find({
      emailSentTo: { $in: emails },
      status: { $in: ['sent', 'accepted', 'self_accepted', 'rejected', 'partially_returned', 'partially_self_returned', 'returned', 'self_returned'] }
    })
      .populate('company', 'name email phone address gstNumber logo settings')
      .populate('party', 'name email phone address gstNumber')
      .sort({ challanDate: -1 });

    res.json({ success: true, data: challans });
  } catch (err) { next(err); }
};

// @desc  Accept received challan (panel - no OTP needed)
// @route POST /api/received-challans/:id/accept
export const acceptReceivedChallan = async (req, res, next) => {
  try {
    const { remarks } = req.body;
    const challan = await Challan.findById(req.params.id)
      .populate('company', 'name email');

    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    if (challan.partyResponse?.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Already ${challan.partyResponse?.status}` });
    }

    const myCompany = await Company.findById(req.user.company);

    challan.partyResponse = {
      status: 'accepted',
      respondedAt: new Date(),
      remarks: remarks || '',
      selfAction: false
    };
    challan.status = 'accepted'; // ← must sync main status
    await challan.save();

    // Notify sender
    await notifyChallanResponse({
      challan,
      action: 'accepted',
      remarks,
      actingCompanyName: myCompany?.name || 'Receiver'
    });

    res.json({ success: true, message: 'Challan accepted successfully!' });
  } catch (err) { next(err); }
};

// @desc  Reject received challan (panel)
// @route POST /api/received-challans/:id/reject
export const rejectReceivedChallan = async (req, res, next) => {
  try {
    const { remarks } = req.body;
    const challan = await Challan.findById(req.params.id)
      .populate('company', 'name email');

    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    if (challan.partyResponse?.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Already ${challan.partyResponse?.status}` });
    }

    const myCompany = await Company.findById(req.user.company);

    challan.partyResponse = {
      status: 'rejected',
      respondedAt: new Date(),
      remarks: remarks || '',
      selfAction: false
    };
    challan.status = 'rejected'; // ← was wrongly set to 'returned'
    await challan.save();

    // Notify sender
    await notifyChallanResponse({
      challan,
      action: 'rejected',
      remarks,
      actingCompanyName: myCompany?.name || 'Receiver'
    });

    res.json({ success: true, message: 'Challan rejected.' });
  } catch (err) { next(err); }
};

// @desc  Create return challan from receiver side
// @route POST /api/received-challans/:id/return
export const createReceiverReturnChallan = async (req, res, next) => {
  try {
    const { items, notes, returnDate } = req.body;

    const challan = await Challan.findById(req.params.id)
      .populate('company', 'name email');

    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });
    if (!['accepted', 'self_accepted', 'partially_returned', 'partially_self_returned'].includes(challan.status)) {
      return res.status(400).json({ success: false, message: 'Challan must be accepted before creating return challan' });
    }

    const myCompany = await Company.findById(req.user.company);

    // Validate quantities
    for (const item of items) {
      if (item.originalItem) {
        const origItem = challan.items.id(item.originalItem);
        if (origItem) {
          const available = origItem.quantity - (origItem.returnedQty || 0);
          if (item.quantity > available) {
            return res.status(400).json({
              success: false,
              message: `Cannot return ${item.quantity} of "${item.itemName}". Only ${available} available.`
            });
          }
        }
      }
    }

    // Use sender company's return challan numbering
    const senderCompany = await Company.findById(challan.company._id);
    const prefix = senderCompany.settings?.returnChallanPrefix || 'RCH';
    const nextNum = senderCompany.settings?.nextReturnChallanNumber || 1;
    const returnChallanNumber = `${prefix}-${nextNum}`;

    let subtotal = 0, totalGST = 0;
    const processedItems = items.map(item => {
      const amount = (item.quantity || 0) * (item.rate || 0);
      const gstAmount = (amount * (item.gstRate || 0)) / 100;
      subtotal += amount;
      totalGST += gstAmount;
      return { ...item, amount, gstAmount };
    });

    const rc = await ReturnChallan.create({
      company: challan.company._id, // belongs to sender's company for ledger
      returnChallanNumber,
      originalChallan: challan._id,
      party: challan.party,
      returnDate: returnDate || new Date(),
      items: processedItems,
      subtotal, totalGST,
      grandTotal: subtotal + totalGST,
      notes,
      returnType: 'party_return',
      createdBy: req.user.id
    });

    // Update returnedQty
    for (const item of items) {
      if (item.originalItem) {
        const origItem = challan.items.id(item.originalItem);
        if (origItem) origItem.returnedQty = (origItem.returnedQty || 0) + item.quantity;
      }
    }
    await challan.save();

    // Increment sender's counter
    senderCompany.settings.nextReturnChallanNumber = nextNum + 1;
    await senderCompany.save();

    // Notify sender about return challan
    await notifyReturnChallanCreated({
      returnChallan: rc,
      senderCompanyId: challan.company._id,
      receiverCompanyName: myCompany?.name || 'Receiver',
      originalChallanNumber: challan.challanNumber
    });

    res.status(201).json({
      success: true,
      message: `Return Challan ${returnChallanNumber} created and sender notified!`,
      data: rc
    });
  } catch (err) { next(err); }
};

// @desc  Get ALL received items from ALL accepted challans for a specific sender party
// @route GET /api/received-challans/items?senderCompany=xxx
export const getReceivedItems = async (req, res, next) => {
  try {
    const { senderCompany } = req.query;
    const myCompany = await Company.findById(req.user.company);
    const myUser = await User.findById(req.user.id);
    const emails = [myCompany?.email, myUser?.email].filter(Boolean);

    const filter = {
      emailSentTo: { $in: emails },
      status: 'sent',
      'partyResponse.status': 'accepted'
    };
    if (senderCompany) filter.company = senderCompany;

    const challans = await Challan.find(filter)
      .populate('company', 'name')
      .select('challanNumber challanDate items company');

    // Flatten all items with challan context
    const allItems = [];
    for (const challan of challans) {
      for (const item of challan.items) {
        const alreadyReturned = item.returnedQty || 0;
        const available = item.quantity - alreadyReturned;
        const marginClosed = item.marginAccepted?.accepted === true;
        if (available > 0 && !marginClosed) {
          allItems.push({
            challanId: challan._id,
            challanNumber: challan.challanNumber,
            challanDate: challan.challanDate,
            senderCompany: challan.company,
            itemId: item._id,
            itemName: item.itemName,
            hsn: item.hsn || '',
            description: item.description || '',
            unit: item.unit,
            rate: item.rate,
            gstRate: item.gstRate,
            sentQty: item.quantity,
            returnedQty: alreadyReturned,
            availableQty: available
          });
        }
      }
    }

    res.json({ success: true, data: allItems });
  } catch (err) { next(err); }
};

// @desc  Get unique sender companies from received challans
// @route GET /api/received-challans/senders
export const getSenderCompanies = async (req, res, next) => {
  try {
    const myCompany = await Company.findById(req.user.company);
    const myUser = await User.findById(req.user.id);
    const emails = [myCompany?.email, myUser?.email].filter(Boolean);

    const challans = await Challan.find({
      emailSentTo: { $in: emails },
      status: { $in: ['accepted', 'self_accepted', 'partially_returned', 'partially_self_returned', 'returned', 'self_returned'] }
    }).populate('company', 'name email').select('company');

    // Unique companies
    const seen = new Set();
    const senders = [];
    for (const c of challans) {
      if (c.company && !seen.has(c.company._id.toString())) {
        seen.add(c.company._id.toString());
        senders.push(c.company);
      }
    }

    res.json({ success: true, data: senders });
  } catch (err) { next(err); }
};

// @desc  Create return challan from receiver - items from multiple challans
// @route POST /api/received-challans/create-return
export const createMultiChallanReturn = async (req, res, next) => {
  try {
    const { senderCompanyId, items, notes, returnDate } = req.body;

    if (!senderCompanyId) return res.status(400).json({ success: false, message: 'Sender company required' });
    if (!items?.length) return res.status(400).json({ success: false, message: 'At least one item required' });

    const myCompany = await Company.findById(req.user.company);
    const senderCompany = await Company.findById(senderCompanyId);
    if (!senderCompany) return res.status(404).json({ success: false, message: 'Sender company not found' });

    // Validate each item's quantity against its source challan
    const challanCache = {};
    for (const item of items) {
      if (!item.originalChallan || !item.originalItem) continue;
      if (!challanCache[item.originalChallan]) {
        challanCache[item.originalChallan] = await Challan.findById(item.originalChallan);
      }
      const challan = challanCache[item.originalChallan];
      if (!challan) continue;
      const origItem = challan.items.id(item.originalItem);
      if (origItem) {
        const available = origItem.quantity - (origItem.returnedQty || 0);
        if (item.quantity > available) {
          return res.status(400).json({
            success: false,
            message: `Cannot return ${item.quantity} of "${item.itemName}" from ${challan.challanNumber}. Only ${available} available.`
          });
        }
      }
    }

    // Generate return challan number using sender's prefix
    const prefix = senderCompany.settings?.returnChallanPrefix || 'RCH';
    const nextNum = senderCompany.settings?.nextReturnChallanNumber || 1;
    const returnChallanNumber = `${prefix}-${nextNum}`;

    // Calculate totals
    let subtotal = 0, totalGST = 0;
    const processedItems = items.map(item => {
      const amount = (item.quantity || 0) * (item.rate || 0);
      const gstAmount = (amount * (item.gstRate || 0)) / 100;
      subtotal += amount;
      totalGST += gstAmount;
      return { ...item, amount, gstAmount };
    });

    // Create return challan under sender's company for their ledger
    const rc = await ReturnChallan.create({
      company: senderCompanyId,
      returnChallanNumber,
      party: null, // receiver doesn't have party ref in sender's DB
      returnDate: returnDate || new Date(),
      items: processedItems,
      subtotal, totalGST,
      grandTotal: subtotal + totalGST,
      notes,
      returnType: 'party_return',
      createdBy: req.user.id,
      createdByCompany: req.user.company,
      receiverCompanyName: myCompany?.name
    });

    // Update returnedQty on each source challan item
    for (const item of items) {
      if (item.originalChallan && item.originalItem) {
        const challan = challanCache[item.originalChallan];
        if (challan) {
          const origItem = challan.items.id(item.originalItem);
          if (origItem) {
            origItem.returnedQty = (origItem.returnedQty || 0) + Number(item.quantity);
            await challan.save();
          }
        }
      }
    }

    // Increment sender's counter
    senderCompany.settings.nextReturnChallanNumber = nextNum + 1;
    await senderCompany.save();

    // Notify sender
    await notifyReturnChallanCreated({
      returnChallan: rc,
      senderCompanyId,
      receiverCompanyName: myCompany?.name || 'Receiver',
      originalChallanNumber: 'multiple challans'
    });

    res.status(201).json({
      success: true,
      message: `Return Challan ${returnChallanNumber} created and sender notified! ✅`,
      data: rc
    });
  } catch (err) { next(err); }
};

// @desc  Get return challans sent by receiver (to their senders) - receiver panel
// @route GET /api/received-challans/returns-sent
export const getReceiverReturnsSent = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const myCompany = await Company.findById(req.user.company);
    const myUser = await User.findById(req.user.id);
    const emails = [myCompany?.email, myUser?.email].filter(Boolean);

    // Step 1: Find challans that were RECEIVED by this user (sent TO their email)
    const receivedChallans = await Challan.find({
      emailSentTo: { $in: emails }
    }).select('_id');
    const receivedChallanIds = receivedChallans.map(c => c._id.toString());

    // Step 2: Find return challans created by this user against received challans
    const allMyReturns = await ReturnChallan.find({
      $or: [
        { createdBy: req.user.id },
        { createdByCompany: req.user.company }
      ]
    }).populate({ path: 'originalChallan', select: 'challanNumber challanDate emailSentTo company', populate: { path: 'company', select: 'name email' } })
      .populate('party', 'name phone email')
      .sort({ returnDate: -1 });

    // Filter: keep returns whose originalChallan OR any item's originalChallan is a received challan
    let returns = allMyReturns.filter(rc => {
      if (rc.originalChallan?._id && receivedChallanIds.includes(rc.originalChallan._id.toString())) return true;
      return rc.items && rc.items.some(item =>
        item.originalChallan && receivedChallanIds.includes(item.originalChallan.toString())
      );
    });

    if (from) returns = returns.filter(rc => new Date(rc.returnDate) >= new Date(from));
    if (to) returns = returns.filter(rc => new Date(rc.returnDate) <= new Date(to + 'T23:59:59'));

    res.json({ success: true, data: returns });
  } catch (err) { next(err); }
};

// @desc  Get receiver ledger - items received vs returned
// @route GET /api/received-challans/ledger
export const getReceiverLedger = async (req, res, next) => {
  try {
    const { senderCompany, from, to, status } = req.query;
    const myCompany = await Company.findById(req.user.company);
    const myUser = await User.findById(req.user.id);
    const emails = [myCompany?.email, myUser?.email].filter(Boolean);

    // Find all challans received by this user
    const challanFilter = {
      emailSentTo: { $in: emails },
      $or: [
        { status: { $in: ['accepted', 'self_accepted', 'partially_returned', 'partially_self_returned', 'returned', 'self_returned'] } },
        { status: 'sent', 'partyResponse.status': 'accepted' }
      ]
    };
    if (senderCompany) challanFilter.company = senderCompany;
    if (from || to) {
      challanFilter.challanDate = {};
      if (from) challanFilter.challanDate.$gte = new Date(from);
      if (to) challanFilter.challanDate.$lte = new Date(to + 'T23:59:59');
    }

    const challans = await Challan.find(challanFilter)
      .populate('company', 'name')
      .populate('party', 'name')
      .sort({ challanDate: -1 });

    if (!challans.length) return res.json({ success: true, data: [], total: 0 });

    // Get all returns created by this user against RECEIVED challans only
    const receivedChallanIds = new Set(challans.map(c => c._id.toString()));
    const allReturnsRaw = await ReturnChallan.find({
      $or: [
        { createdBy: req.user.id },
        { createdByCompany: req.user.company }
      ]
    }).sort({ returnDate: 1 });
    // Include single-challan returns AND multi-challan returns whose items reference received challans
    const allReturns = allReturnsRaw.filter(rc => {
      if (rc.originalChallan && receivedChallanIds.has(rc.originalChallan.toString())) return true;
      // Multi-challan return: check if any item references a received challan
      return rc.items && rc.items.some(item =>
        item.originalChallan && receivedChallanIds.has(item.originalChallan.toString())
      );
    });

    const ledger = [];
    for (const challan of challans) {
      for (const item of challan.items) {
        const itemReturns = [];
        for (const rc of allReturns) {
          const returnedItem = rc.items.find(ri =>
            ri.originalItem?.toString() === item._id.toString()
          );
          if (returnedItem) {
            itemReturns.push({
              returnChallanNumber: rc.returnChallanNumber,
              returnDate: rc.returnDate,
              returnQty: returnedItem.quantity,
            });
          }
        }

        const totalReturned = item.returnedQty || 0;
        const balance = item.quantity - totalReturned;
        const isFullyReturned = balance === 0;
        let ledgerStatus;
        if (isFullyReturned) ledgerStatus = 'fully_returned';
        else if (totalReturned > 0) ledgerStatus = 'partially_returned';
        else ledgerStatus = 'pending';

        if (status && status !== 'all' && ledgerStatus !== status) continue;

        ledger.push({
          challanId: challan._id,
          itemId: item._id,
          challanNumber: challan.challanNumber,
          challanDate: challan.challanDate,
          senderCompany: challan.company,
          itemName: item.itemName,
          hsn: item.hsn || '',
          unit: item.unit,
          receivedQty: item.quantity,
          rate: item.rate,
          returns: itemReturns,
          totalReturnedQty: totalReturned,
          balanceQty: balance,
          isClosed: isFullyReturned,
          ledgerStatus,
        });
      }
    }

    res.json({ success: true, data: ledger, total: ledger.length });
  } catch (err) { next(err); }
};
