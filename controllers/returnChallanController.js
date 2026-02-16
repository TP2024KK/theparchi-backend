import ReturnChallan from '../models/ReturnChallan.js';
import Challan from '../models/Challan.js';
import Company from '../models/Company.js';

// @desc  Get accepted challans for return (dropdown)
// @route GET /api/return-challans/accepted
export const getAcceptedChallans = async (req, res, next) => {
  try {
    const challans = await Challan.find({
      company: req.user.company,
      'partyResponse.status': 'accepted'
    })
    .populate('party', 'name')
    .select('challanNumber party challanDate items grandTotal')
    .sort({ challanDate: -1 });

    res.json({ success: true, data: challans });
  } catch (err) { next(err); }
};

// @desc  Get all return challans
// @route GET /api/return-challans
export const getReturnChallans = async (req, res, next) => {
  try {
    const { party, from, to } = req.query;
    const filter = { company: req.user.company };
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

// @desc  Create return challan
// @route POST /api/return-challans
export const createReturnChallan = async (req, res, next) => {
  try {
    const { originalChallan: originalId, items, notes, returnType, returnDate } = req.body;

    // Validate original challan
    const original = await Challan.findOne({
      _id: originalId,
      company: req.user.company,
      'partyResponse.status': 'accepted'
    });

    if (!original) {
      return res.status(400).json({ success: false, message: 'Challan not found or not accepted yet. Only accepted challans can have return challans.' });
    }

    // Validate return quantities don't exceed available
    for (const item of items) {
      if (item.originalItem) {
        const origItem = original.items.id(item.originalItem);
        if (origItem) {
          const alreadyReturned = origItem.returnedQty || 0;
          const available = origItem.quantity - alreadyReturned;
          if (item.quantity > available) {
            return res.status(400).json({
              success: false,
              message: `Cannot return ${item.quantity} of "${item.itemName}". Only ${available} available (${origItem.quantity} sent - ${alreadyReturned} already returned).`
            });
          }
        }
      }
    }

    // Generate return challan number
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

    const rc = await ReturnChallan.create({
      company: req.user.company,
      returnChallanNumber,
      originalChallan: originalId,
      party: original.party,
      returnDate: returnDate || new Date(),
      items: processedItems,
      subtotal,
      totalGST,
      grandTotal: subtotal + totalGST,
      notes,
      returnType: returnType || 'party_return',
      createdBy: req.user.id
    });

    // Update returnedQty on original challan items
    for (const item of items) {
      if (item.originalItem) {
        const origItem = original.items.id(item.originalItem);
        if (origItem) {
          origItem.returnedQty = (origItem.returnedQty || 0) + item.quantity;
        }
      }
    }
    await original.save();

    // Increment company counter
    company.settings.nextReturnChallanNumber = nextNum + 1;
    await company.save();

    const populated = await ReturnChallan.findById(rc._id)
      .populate('party', 'name')
      .populate('originalChallan', 'challanNumber');

    res.status(201).json({ success: true, data: populated, message: `Return Challan ${returnChallanNumber} created!` });
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
    const { party, from, to } = req.query;
    const filter = {
      company: req.user.company,
      'partyResponse.status': 'accepted'
    };
    if (party) filter.party = party;
    if (from || to) {
      filter.challanDate = {};
      if (from) filter.challanDate.$gte = new Date(from);
      if (to) filter.challanDate.$lte = new Date(to + 'T23:59:59');
    }

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

        ledger.push({
          // Sent info
          challanId: challan._id,
          itemId: item._id,
          challanNumber: challan.challanNumber,
          challanDate: challan.challanDate,
          party: challan.party,
          partyResponse: challan.partyResponse,
          // Item info
          itemName: item.itemName,
          hsn: item.hsn || '',
          unit: item.unit,
          sentQty: item.quantity,
          rate: item.rate,
          // Return info
          returns: itemReturns,
          totalReturnedQty: totalReturned,
          balanceQty: balance,
          // Margin
          marginAccepted: item.marginAccepted || null,
          isClosed: balance === 0 || (item.marginAccepted?.accepted === true)
        });
      }
    }

    res.json({ success: true, data: ledger || [], total: ledger.length });
  } catch (err) { next(err); }
};
