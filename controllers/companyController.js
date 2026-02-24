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

/**
 * @desc    Lookup company by code (for linking parties)
 * @route   GET /api/company/lookup/:code
 * @access  Private
 */
export const lookupByCode = async (req, res, next) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const company = await Company.findOne({ companyCode: code })
      .select('name email phone gstNumber address companyCode');

    if (!company) {
      return res.status(404).json({ success: false, message: 'No company found with this code' });
    }

    // Don't return your own company
    if (company._id.toString() === req.user.company.toString()) {
      return res.status(400).json({ success: false, message: 'This is your own company code' });
    }

    res.status(200).json({ success: true, data: company });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add or update a challan prefix
 * @route   POST /api/company/prefixes
 * @access  Private (Owner/Admin)
 */
export const addPrefix = async (req, res, next) => {
  try {
    const { name, label } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Prefix name is required' });

    const company = await Company.findById(req.user.company);
    const prefixes = company.settings.challanPrefixes || [];

    // Check if prefix name already exists
    if (prefixes.find(p => p.name === name.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Prefix already exists' });
    }

    prefixes.push({ name: name.toUpperCase(), label: label || name, counter: 1 });
    company.settings.challanPrefixes = prefixes;
    company.markModified('settings');
    await company.save();

    res.status(201).json({ success: true, data: company.settings.challanPrefixes, message: `Prefix ${name.toUpperCase()} added` });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a challan prefix
 * @route   DELETE /api/company/prefixes/:name
 * @access  Private (Owner/Admin)
 */
export const deletePrefix = async (req, res, next) => {
  try {
    const name = req.params.name.toUpperCase();
    const company = await Company.findById(req.user.company);
    const prefixes = company.settings.challanPrefixes || [];

    company.settings.challanPrefixes = prefixes.filter(p => p.name !== name);
    company.markModified('settings');
    await company.save();

    res.status(200).json({ success: true, message: `Prefix ${name} deleted` });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign prefix to a party
 * @route   PUT /api/company/party-prefix
 * @access  Private (Owner/Admin)
 */
export const assignPartyPrefix = async (req, res, next) => {
  try {
    const { partyId, prefix } = req.body; // prefix = '' means use default
    const company = await Company.findById(req.user.company);
    const rules = company.settings.partyPrefixRules || [];

    const existing = rules.findIndex(r => r.party?.toString() === partyId);
    if (prefix === '' || prefix === null) {
      // Remove rule (use default)
      if (existing > -1) rules.splice(existing, 1);
    } else {
      if (existing > -1) rules[existing].prefix = prefix;
      else rules.push({ party: partyId, prefix });
    }

    company.settings.partyPrefixRules = rules;
    company.markModified('settings');
    await company.save();

    res.status(200).json({ success: true, message: 'Party prefix updated' });
  } catch (error) {
    next(error);
  }
};
