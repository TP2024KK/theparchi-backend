import Company from '../models/Company.js';

/**
 * @desc    Get company details
 * @route   GET /api/company
 * @access  Private
 */
export const getCompany = async (req, res, next) => {
  try {
    const company = await Company.findById(req.user.company)
      .populate('owner', 'name email');

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.status(200).json({
      success: true,
      data: company
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update company details
 * @route   PUT /api/company
 * @access  Private (Owner/Admin only)
 */
export const updateCompany = async (req, res, next) => {
  try {
    const allowedUpdates = [
      'name',
      'email',
      'phone',
      'address',
      'gstNumber',
      'pan',
      'logo',
      'bankDetails',
      'settings'
    ];

    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const company = await Company.findByIdAndUpdate(
      req.user.company,
      updates,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      data: company
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update company settings
 * @route   PUT /api/company/settings
 * @access  Private (Owner/Admin only)
 */
export const updateSettings = async (req, res, next) => {
  try {
    const company = await Company.findById(req.user.company);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // UPDATED: Allow updating all settings fields
    const { settings } = req.body;
    
    if (settings) {
      // Merge new settings with existing settings
      company.settings = {
        ...company.settings.toObject(),
        ...settings
      };
    }

    await company.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: company
    });
  } catch (error) {
    next(error);
  }
};
