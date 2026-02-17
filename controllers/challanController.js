import Challan from '../models/Challan.js';
import Company from '../models/Company.js';
import Party from '../models/Party.js';

/**
 * @desc    Create new challan
 * @route   POST /api/challans
 * @access  Private
 */
export const createChallan = async (req, res, next) => {
  try {
    const { party, challanDate, items, notes } = req.body;

    // Get company and generate challan number
    const company = await Company.findById(req.user.company);
    const challanNumber = `${company.settings.challanPrefix}-${company.settings.nextChallanNumber}`;

    // Calculate totals
    let subtotal = 0;
    let totalGST = 0;

    const processedItems = items.map(item => {
      const amount = item.quantity * item.rate;
      const gstAmount = (amount * item.gstRate) / 100;
      
      subtotal += amount;
      totalGST += gstAmount;

      return {
        ...item,
        amount,
        gstAmount
      };
    });

    const grandTotal = subtotal + totalGST;

    // Create challan
    const challan = await Challan.create({
      company: req.user.company,
      challanNumber,
      party,
      challanDate: challanDate || Date.now(),
      items: processedItems,
      subtotal,
      totalGST,
      grandTotal,
      notes,
      createdBy: req.user.id,
      status: 'draft'
    });

    // Increment challan number in company settings
    company.settings.nextChallanNumber += 1;
    await company.save();

    // Populate party details
    await challan.populate('party');
    await challan.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Challan created successfully',
      data: challan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all challans for company
 * @route   GET /api/challans
 * @access  Private
 */
export const getChallans = async (req, res, next) => {
  try {
    const { status, party, startDate, endDate, page = 1, limit = 20 } = req.query;

    // Build query
    console.log('=== getChallans DEBUG ===');
    console.log('User ID:', req.user.id);
    console.log('User email:', req.user.email);
    console.log('User company:', req.user.company);
    console.log('Company type:', typeof req.user.company);
    const query = { company: req.user.company };

    if (status) {
      query.status = status;
    }

    if (party) {
      query.party = party;
    }

    if (startDate || endDate) {
      query.challanDate = {};
      if (startDate) query.challanDate.$gte = new Date(startDate);
      if (endDate) query.challanDate.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [challans, total] = await Promise.all([
      Challan.find(query)
        .populate('party', 'name phone gstNumber')
        .populate('createdBy', 'name')
        .sort({ challanDate: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      Challan.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: challans,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single challan
 * @route   GET /api/challans/:id
 * @access  Private
 */
export const getChallan = async (req, res, next) => {
  try {
    const challan = await Challan.findOne({
      _id: req.params.id,
      company: req.user.company
    })
      .populate('party')
      .populate('createdBy', 'name email')
      .populate('returnChallans');

    if (!challan) {
      return res.status(404).json({
        success: false,
        message: 'Challan not found'
      });
    }

    res.status(200).json({
      success: true,
      data: challan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update challan
 * @route   PUT /api/challans/:id
 * @access  Private
 */
export const updateChallan = async (req, res, next) => {
  try {
    let challan = await Challan.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!challan) {
      return res.status(404).json({
        success: false,
        message: 'Challan not found'
      });
    }

    // Don't allow updates to completed/cancelled challans
    if (challan.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update cancelled challan'
      });
    }

    const { party, challanDate, items, notes, status } = req.body;

    // Recalculate totals if items are updated
    if (items) {
      let subtotal = 0;
      let totalGST = 0;

      const processedItems = items.map(item => {
        const amount = item.quantity * item.rate;
        const gstAmount = (amount * item.gstRate) / 100;
        
        subtotal += amount;
        totalGST += gstAmount;

        return {
          ...item,
          amount,
          gstAmount
        };
      });

      challan.items = processedItems;
      challan.subtotal = subtotal;
      challan.totalGST = totalGST;
      challan.grandTotal = subtotal + totalGST;
    }

    if (party) challan.party = party;
    if (challanDate) challan.challanDate = challanDate;
    if (notes !== undefined) challan.notes = notes;
    if (status) challan.status = status;

    await challan.save();
    await challan.populate('party');
    await challan.populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Challan updated successfully',
      data: challan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete challan
 * @route   DELETE /api/challans/:id
 * @access  Private
 */
export const deleteChallan = async (req, res, next) => {
  try {
    const challan = await Challan.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!challan) {
      return res.status(404).json({
        success: false,
        message: 'Challan not found'
      });
    }

    // Only allow deletion of draft challans
    if (challan.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft challans can be deleted'
      });
    }

    await challan.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Challan deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get challan statistics
 * @route   GET /api/challans/stats
 * @access  Private
 */
export const getChallanStats = async (req, res, next) => {
  try {
    const stats = await Challan.aggregate([
      { $match: { company: req.user.company } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$grandTotal' }
        }
      }
    ]);

    const total = await Challan.countDocuments({ company: req.user.company });

    res.status(200).json({
      success: true,
      data: {
        total,
        byStatus: stats
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc  Send challan to party via email
// @route POST /api/challans/:id/send
export const sendChallan = async (req, res, next) => {
  try {
    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company })
      .populate('party', 'name email phone')
      .populate('company', 'name email');

    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });

    const party = challan.party;
    if (!party.email) {
      return res.status(400).json({ success: false, message: 'Party does not have an email address. Please add email to party first.' });
    }

    // Generate unique public token
    const crypto = await import('crypto');
    const publicToken = crypto.default.randomBytes(32).toString('hex');

    // Update challan
    challan.publicToken = publicToken;
    challan.status = 'sent';
    challan.emailSentAt = new Date();
    challan.emailSentTo = party.email;
    challan.partyResponse = { status: 'pending' };
    await challan.save();

    // Build public link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const publicLink = `${frontendUrl}/challan/view/${publicToken}`;

    // Send email
    const { sendChallanEmail } = await import('../utils/email.js');
    await sendChallanEmail(
      party.email,
      party.name,
      challan.company.name || req.user.company,
      challan.challanNumber,
      new Date(challan.challanDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      challan.grandTotal,
      publicLink,
      challan.items
    );

    res.json({
      success: true,
      message: `Challan sent to ${party.email} successfully!`,
      data: { publicLink, emailSentTo: party.email }
    });
  } catch (err) {
    console.error('Send challan error:', err);
    next(err);
  }
};

// @desc  Self Accept or Reject challan (by sender for their own records)
// @route POST /api/challans/:id/self-action
export const selfActionChallan = async (req, res, next) => {
  try {
    const { action, remarks } = req.body;

    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be accepted or rejected' });
    }

    const challan = await Challan.findOne({ _id: req.params.id, company: req.user.company });
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });

    if (challan.status !== 'sent') {
      return res.status(400).json({ success: false, message: 'Only sent challans can be self-actioned' });
    }

    if (challan.partyResponse?.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Challan already ${challan.partyResponse?.status}` });
    }

    challan.partyResponse = {
      status: action,
      respondedAt: new Date(),
      remarks: remarks || '',
      selfAction: true,
      actionBy: req.user.id
    };

    await challan.save();

    res.json({
      success: true,
      message: `Challan self-${action} successfully!`,
      data: challan
    });
  } catch (err) {
    next(err);
  }
};
