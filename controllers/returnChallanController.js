import ReturnChallan from '../models/ReturnChallan.js';
import Challan from '../models/Challan.js';
import Company from '../models/Company.js';

// @desc  Get accepted challans for return (dropdown)
// @route GET /api/return-challans/accepted
export const getAcceptedChallans = async (req, res, next) => {
  try {
    const challans = await Challan.find({
      company: req.user.company,
status: { $in: ['accepted', 'self_accepted', 'partially_returned', 'partially_self_returned'] }
    })
    .populate('party', 'name')
    .select('challanNumber party challanDate items grandTotal')
    .sort({ challanDate: -1 });

    res.json({ success: true, data: challans });
  } catch (err) { next(err); }
};

// @desc  Get all return challans SENT by this company (self_return type)
// @route GET /api/return-challans
export const getReturnChallans = async (req, res, next) => {
  try {
    const { party, from, to } = req.query;
    const filter = { company: req.user.company, returnType: 'self_return' }; // Only self returns
    if (party) filter.party = party;
    if (from || to) {
      filter.returnDate = {};
      if (from) filter.returnDate.$gte = new Date(from);
      if (to) filter.returnDate.$lte = new Date(to + 'T23:59:59');
    }

    const returnChallans = await ReturnChallan.find(filter)
      .populate('party', 'name phone email')
      .populate('originalChallan', 'challanNumber challanDate')
      .populate('createdBy', 'name')
      .sort({ returnDate: -1 });

    res.json({ success: true, data: returnChallans });
  } catch (err) { next(err); }
};

// @desc  Get single return challan
// @route GET /api/return-challans/:id
export const getReturnChallan = async (req, res, next) => {
  try {
    const rc = await ReturnChallan.findOne({ _id: req.params.id, company: req.user.company })
      .populate('party', 'name phone email address gstNumber')
      .populate('originalChallan', 'challanNumber challanDate')
      .populate('company', 'name address phone email gstNumber bankDetails settings logo signature')
      .populate('createdBy', 'name');
    if (!rc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rc });
  } catch (err) { next(err); }
};

// @desc  Create return challan (multi-challan: items from different challans)
// @route POST /api/return-challans
export const createReturnChallan = async (req, res, next) => {
  try {
    const { party: partyId, items, notes, returnType, returnDate } = req.body;

    if (!items?.length) return res.status(400).json({ success: false, message: 'At least one item required' });

    // Validate and update each item's source challan
    const challanCache = {};
    for (const item of items) {
      if (!item.originalChallan) continue;
      if (!challanCache[item.originalChallan]) {
        challanCache[item.originalChallan] = await Challan.findOne({
          _id: item.originalChallan,
          company: req.user.company,
    status: { $in: ['accepted', 'self_accepted', 'partially_returned', 'partially_self_returned'] }
        });
      }
      const challan = challanCache[item.originalChallan];
      if (!challan) continue;
      if (item.originalItem) {
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
    }

    // Generate number
    const company = await Company.findById(req.user.company);
    const prefix = company.settings?.returnChallanPrefix || 'RCH';
    const nextNum = company.settings?.nextReturnChallanNumber || 1;
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

    // Get party from first challan if not provided
    let party = partyId;
    if (!party) {
      const firstChallanId = items.find(i => i.originalChallan)?.originalChallan;
      if (firstChallanId && challanCache[firstChallanId]) {
        party = challanCache[firstChallanId].party;
      }
    }

    const rc = await ReturnChallan.create({
      company: req.user.company,
      returnChallanNumber,
      party,
      returnDate: returnDate || new Date(),
      items: processedItems,
      subtotal, totalGST,
      grandTotal: subtotal + totalGST,
      notes,
      returnType: 'self_return',  // Sender creating return = always self_return
      createdBy: req.user.id
    });

    // Update returnedQty on each source challan AND update challan status
    for (const item of items) {
      if (item.originalChallan && item.originalItem) {
        const challan = challanCache[item.originalChallan];
        if (challan) {
          const origItem = challan.items.id(item.originalItem);
          if (origItem) {
            origItem.returnedQty = (origItem.returnedQty || 0) + Number(item.quantity);
            
            // Recalculate return status
            const isCreatorReturning = challan.createdBy?.toString() === req.user.id.toString() ||
              challan.company?.toString() === req.user.company?.toString();
            
            const totalQty = challan.items.reduce((sum, i) => sum + i.quantity, 0);
            const totalReturned = challan.items.reduce((sum, i) => sum + (i.returnedQty || 0), 0);
            const isFullReturn = totalReturned >= totalQty;
            
            // Determine new status based on who is returning
            if (isCreatorReturning) {
              // Sender/owner is doing the return = SELF return
              challan.status = isFullReturn ? 'self_returned' : 'partially_self_returned';
            } else {
              // External party is returning
              challan.status = isFullReturn ? 'returned' : 'partially_returned';
            }
            
            await challan.save();
          }
        }
      }
    }

    company.settings.nextReturnChallanNumber = nextNum + 1;
    await company.save();

    res.status(201).json({ success: true, data: rc, message: `Return Challan ${returnChallanNumber} created!` });
  } catch (err) { next(err); }
};

// @desc  Accept margin for a challan item
// @route POST /api/return-challans/accept-margin
export const acceptMargin = async (req, res, next) => {
  try {
    const { challanId, itemId, comment } = req.body;

    const challan = await Challan.findOne({ _id: challanId, company: req.user.company });
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });

    const item = challan.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const balance = item.quantity - (item.returnedQty || 0);
    if (balance <= 0) return res.status(400).json({ success: false, message: 'No balance to accept margin for' });

    item.marginAccepted = {
      accepted: true,
      acceptedAt: new Date(),
      acceptedBy: req.user.id,
      comment: comment || '',
      balanceQtyAtAcceptance: balance
    };

    await challan.save();

    res.json({
      success: true,
      message: `Margin accepted for "${item.itemName}" - ${balance} ${item.unit} balance closed.`,
      data: { itemName: item.itemName, balance, comment }
    });
  } catch (err) { next(err); }
};

// @desc  Get ledger - challan wise with returns
// @route GET /api/return-challans/ledger
export const getLedger = async (req, res, next) => {
  try {
    const { party, from, to, status } = req.query;

    // Base filter - ALL accepted/returned challans (never exclude from ledger)
    const filter = {
      company: req.user.company,
      status: { $in: ['accepted', 'self_accepted', 'returned', 'self_returned', 'partially_returned', 'partially_self_returned'] }
    };

    // Optional filters
    if (party) filter.party = party;
    if (from || to) {
      filter.challanDate = {};
      if (from) filter.challanDate.$gte = new Date(from);
      if (to) filter.challanDate.$lte = new Date(to + 'T23:59:59');
    }
    // Status filter for ledger rows (pending balance, fully returned, margin accepted)
    // Applied after building ledger rows below

    const challans = await Challan.find(filter)
      .populate('party', 'name phone')
      .sort({ challanDate: -1 });

    if (!challans.length) {
      return res.json({ success: true, data: [], total: 0 });
    }

    // Get all return challans for this company
    const challanIds = challans.map(c => c._id);
    const returnChallans = await ReturnChallan.find({
      company: req.user.company
    }).sort({ returnDate: 1 });

    // Build ledger rows
    const ledger = [];
    for (const challan of challans) {
      for (const item of challan.items) {
        // Find all returns for this item
        const itemReturns = [];
        for (const rc of returnChallans) {
          // Check item-level originalChallan (new multi-challan returns)
          const returnedItem = rc.items.find(ri =>
            ri.originalItem?.toString() === item._id.toString() &&
            (ri.originalChallan?.toString() === challan._id.toString() ||
             rc.originalChallan?.toString() === challan._id.toString())
          );
          if (returnedItem) {
            itemReturns.push({
              returnChallanNumber: rc.returnChallanNumber,
              returnDate: rc.returnDate,
              returnQty: returnedItem.quantity,
              returnType: rc.returnType
            });
          }
        }

        const totalReturned = item.returnedQty || 0;
        const balance = item.quantity - totalReturned;

        const isMarginAccepted = item.marginAccepted?.accepted === true;
        const isFullyReturned = balance === 0;
        
        // Ledger status for filtering
        let ledgerStatus;
        if (isMarginAccepted) ledgerStatus = 'margin_accepted';
        else if (isFullyReturned) ledgerStatus = 'fully_returned';
        else if (totalReturned > 0) ledgerStatus = 'partially_returned';
        else ledgerStatus = 'pending'; // sent, accepted, no return yet

        // Apply status filter if requested
        if (status && status !== 'all' && ledgerStatus !== status) continue;

        ledger.push({
          // Sent info
          challanId: challan._id,
          itemId: item._id,
          challanNumber: challan.challanNumber,
          challanDate: challan.challanDate,
          challanStatus: challan.status,
          party: challan.party,
          partyResponse: challan.partyResponse,
          // Item info
          itemName: item.itemName,
          hsn: item.hsn || '',
          unit: item.unit,
          sentQty: item.quantity,
          rate: item.rate,
          amount: item.amount,
          // Return info
          returns: itemReturns,
          totalReturnedQty: totalReturned,
          balanceQty: balance,
          // Margin
          marginAccepted: item.marginAccepted || null,
          isClosed: isFullyReturned || isMarginAccepted,
          ledgerStatus, // 'pending' | 'partially_returned' | 'fully_returned' | 'margin_accepted'
        });
      }
    }

    res.json({ success: true, data: ledger || [], total: ledger.length });
  } catch (err) { next(err); }
};

// @desc  Get return challans received by this company (party returned goods to sender)
// @route GET /api/return-challans/received
// These are ReturnChallans stored under sender's company with returnType='party_return'
export const getReceivedReturnChallans = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const returnFilter = {
      company: req.user.company,
      // Both self_return (Kundan recorded it himself) and party_return (receiver created it)
      // All goods that came BACK to Kundan against his sent challans
    };
    if (from || to) {
      returnFilter.returnDate = {};
      if (from) returnFilter.returnDate.$gte = new Date(from);
      if (to) returnFilter.returnDate.$lte = new Date(to + 'T23:59:59');
    }

    const receivedReturns = await ReturnChallan.find(returnFilter)
      .populate('party', 'name phone email')
      .populate('originalChallan', 'challanNumber challanDate')
      .populate('createdBy', 'name')
      .sort({ returnDate: -1 });

    res.json({ success: true, data: receivedReturns });
  } catch (err) { next(err); }
};
