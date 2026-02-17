import Party from '../models/Party.js';

/**
 * @desc    Create new party
 * @route   POST /api/parties
 * @access  Private
 */
export const createParty = async (req, res, next) => {
  try {
    const partyData = {
      ...req.body,
      company: req.user.company,
      createdBy: req.user.id
    };

    const party = await Party.create(partyData);

    res.status(201).json({
      success: true,
      message: 'Party created successfully',
      data: party
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all parties
 * @route   GET /api/parties
 * @access  Private
 */
export const getParties = async (req, res, next) => {
  try {
    const { type, search, page = 1, limit = 50 } = req.query;

    console.log('getParties - User:', req.user.id, '| Company:', req.user.company);
    const query = { 
      company: req.user.company,
      isActive: true
    };

    if (type) {
      query.type = type;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [parties, total] = await Promise.all([
      Party.find(query)
        .sort({ name: 1 })
        .limit(parseInt(limit))
        .skip(skip),
      Party.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: parties,
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
 * @desc    Get single party
 * @route   GET /api/parties/:id
 * @access  Private
 */
export const getParty = async (req, res, next) => {
  try {
    const party = await Party.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: 'Party not found'
      });
    }

    res.status(200).json({
      success: true,
      data: party
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update party
 * @route   PUT /api/parties/:id
 * @access  Private
 */
export const updateParty = async (req, res, next) => {
  try {
    const party = await Party.findOneAndUpdate(
      {
        _id: req.params.id,
        company: req.user.company
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!party) {
      return res.status(404).json({
        success: false,
        message: 'Party not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Party updated successfully',
      data: party
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete/deactivate party
 * @route   DELETE /api/parties/:id
 * @access  Private
 */
export const deleteParty = async (req, res, next) => {
  try {
    const party = await Party.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: 'Party not found'
      });
    }

    // Soft delete - just deactivate
    party.isActive = false;
    await party.save();

    res.status(200).json({
      success: true,
      message: 'Party deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
};
