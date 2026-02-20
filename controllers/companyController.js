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
    const company = await Company.findById(req.user.company);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    // Simple scalar fields
    const scalarFields = ['name', 'email', 'phone', 'gstNumber', 'pan', 'logo', 'signature'];
    scalarFields.forEach(f => { if (req.body[f] !== undefined) company[f] = req.body[f]; });

    // Nested objects
    if (req.body.address)     company.address     = { ...(company.address?.toObject?.() || company.address || {}),     ...req.body.address };
    if (req.body.bankDetails) company.bankDetails = { ...(company.bankDetails?.toObject?.() || company.bankDetails || {}), ...req.body.bankDetails };
    if (req.body.settings)    company.settings    = { ...(company.settings?.toObject?.()    || company.settings    || {}), ...req.body.settings };

    // Arrays - strip invalid _ids so Mongoose auto-generates them
    if (req.body.challanTemplates !== undefined) {
      const mongoose = await import('mongoose');
      company.challanTemplates = req.body.challanTemplates.map(t => {
        const { _id, ...rest } = t;
        // Keep _id only if it's a valid ObjectId, otherwise let Mongoose generate one
        const isValidId = _id && mongoose.default.Types.ObjectId.isValid(_id) && String(new mongoose.default.Types.ObjectId(_id)) === String(_id);
        return isValidId ? { _id, ...rest } : rest;
      });
      company.markModified('challanTemplates');
    }

    await company.save();

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
