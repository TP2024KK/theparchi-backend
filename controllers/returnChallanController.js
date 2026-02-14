import ReturnChallan from '../models/ReturnChallan.js';
import Challan from '../models/Challan.js';
import Company from '../models/Company.js';

/**
 * @desc    Create return challan
 * @route   POST /api/return-challans
 * @access  Private
 */
export const createReturnChallan = async (req, res, next) => {
  try {
    const { originalChallanId, returnDate, items, notes } = req.body;

    // Verify original challan exists and belongs to company
    const originalChallan = await Challan.findOne({
      _id: originalChallanId,
      company: req.user.company
    });

    if (!originalChallan) {
      return res.status(404).json({
        success: false,
        message: 'Original challan not found'
      });
    }

    // Get company and generate return challan number
    const company = await Company.findById(req.user.company);
    const returnChallanNumber = `${company.settings.returnChallanPrefix}-${company.settings.nextReturnChallanNumber}`;

    // Calculate totals
    let subtotal = 0;
    let totalGST = 0;

    const processedItems = items.map(item => {
      const amount = item.quantityReturned * item.rate;
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

    // Create return challan
    const returnChallan = await ReturnChallan.create({
      company: req.user.company,
      returnChallanNumber,
      originalChallan: originalChallanId,
      party: originalChallan.party,
      returnDate: returnDate || Date.now(),
      items: processedItems,
      subtotal,
      totalGST,
      grandTotal,
      notes,
      createdBy: req.user.id,
      status: 'pending'
    });

    // Add return challan reference to original challan
    originalChallan.returnChallans.push(returnChallan._id);
    originalChallan.status = 'returned';
    await originalChallan.save();

    // Increment return challan number
    company.settings.nextReturnChallanNumber += 1;
    await company.save();

    // Populate details
    await returnChallan.populate('party');
    await returnChallan.populate('originalChallan', 'challanNumber');
    await returnChallan.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Return challan created successfully',
      data: returnChallan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all return challans
 * @route   GET /api/return-challans
 * @access  Private
 */
export const getReturnChallans = async (req, res, next) => {
  try {
    const { status, party, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = { company: req.user.company };

    if (status) query.status = status;
    if (party) query.party = party;
    
    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) query.returnDate.$gte = new Date(startDate);
      if (endDate) query.returnDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [returnChallans, total] = await Promise.all([
      ReturnChallan.find(query)
        .populate('party', 'name phone')
        .populate('originalChallan', 'challanNumber')
        .populate('createdBy', 'name')
        .sort({ returnDate: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      ReturnChallan.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: returnChallans,
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
 * @desc    Get single return challan
 * @route   GET /api/return-challans/:id
 * @access  Private
 */
export const getReturnChallan = async (req, res, next) => {
  try {
    const returnChallan = await ReturnChallan.findOne({
      _id: req.params.id,
      company: req.user.company
    })
      .populate('party')
      .populate('originalChallan')
      .populate('createdBy', 'name email');

    if (!returnChallan) {
      return res.status(404).json({
        success: false,
        message: 'Return challan not found'
      });
    }

    res.status(200).json({
      success: true,
      data: returnChallan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update return challan status
 * @route   PUT /api/return-challans/:id
 * @access  Private
 */
export const updateReturnChallan = async (req, res, next) => {
  try {
    const returnChallan = await ReturnChallan.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!returnChallan) {
      return res.status(404).json({
        success: false,
        message: 'Return challan not found'
      });
    }

    const { status, notes } = req.body;

    if (status) returnChallan.status = status;
    if (notes !== undefined) returnChallan.notes = notes;

    await returnChallan.save();
    await returnChallan.populate('party');
    await returnChallan.populate('originalChallan', 'challanNumber');

    res.status(200).json({
      success: true,
      message: 'Return challan updated successfully',
      data: returnChallan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete return challan
 * @route   DELETE /api/return-challans/:id
 * @access  Private
 */
export const deleteReturnChallan = async (req, res, next) => {
  try {
    const returnChallan = await ReturnChallan.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!returnChallan) {
      return res.status(404).json({
        success: false,
        message: 'Return challan not found'
      });
    }

    // Only allow deletion of pending return challans
    if (returnChallan.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending return challans can be deleted'
      });
    }

    // Remove reference from original challan
    await Challan.findByIdAndUpdate(
      returnChallan.originalChallan,
      { $pull: { returnChallans: returnChallan._id } }
    );

    await returnChallan.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Return challan deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
