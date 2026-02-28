import Warehouse from '../models/Warehouse.js';

// GET /api/warehouses
export const getWarehouses = async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find({ company: req.user.company, isActive: true })
      .sort({ isDefault: -1, name: 1 });
    res.json({ success: true, data: warehouses });
  } catch (err) { next(err); }
};

// GET /api/warehouses/:id
export const getWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findOne({ _id: req.params.id, company: req.user.company });
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.json({ success: true, data: warehouse });
  } catch (err) { next(err); }
};

// POST /api/warehouses
export const createWarehouse = async (req, res, next) => {
  try {
    const { name, code, address, contactPerson, phone, isDefault, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Warehouse name is required' });

    // Check duplicate name
    const existing = await Warehouse.findOne({ company: req.user.company, name: name.trim(), isActive: true });
    if (existing) return res.status(400).json({ success: false, message: `Warehouse "${name}" already exists` });

    // If setting as default, unset others
    if (isDefault) {
      await Warehouse.updateMany({ company: req.user.company }, { isDefault: false });
    }

    // If first warehouse, make it default automatically
    const count = await Warehouse.countDocuments({ company: req.user.company, isActive: true });
    const makeDefault = isDefault || count === 0;

    const warehouse = await Warehouse.create({
      company: req.user.company,
      name: name.trim(),
      code: code?.trim().toUpperCase() || '',
      address: address || {},
      contactPerson: contactPerson || '',
      phone: phone || '',
      isDefault: makeDefault,
      notes: notes || ''
    });

    res.status(201).json({ success: true, message: 'Warehouse created!', data: warehouse });
  } catch (err) { next(err); }
};

// PUT /api/warehouses/:id
export const updateWarehouse = async (req, res, next) => {
  try {
    const { name, code, address, contactPerson, phone, isDefault, notes } = req.body;

    // If setting as default, unset others
    if (isDefault) {
      await Warehouse.updateMany({ company: req.user.company }, { isDefault: false });
    }

    const warehouse = await Warehouse.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { name, code: code?.toUpperCase(), address, contactPerson, phone, isDefault, notes },
      { new: true }
    );
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.json({ success: true, message: 'Warehouse updated!', data: warehouse });
  } catch (err) { next(err); }
};

// DELETE /api/warehouses/:id  (soft delete)
export const deleteWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findOne({ _id: req.params.id, company: req.user.company });
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    if (warehouse.isDefault) return res.status(400).json({ success: false, message: 'Cannot delete the default warehouse. Set another as default first.' });

    warehouse.isActive = false;
    await warehouse.save();
    res.json({ success: true, message: 'Warehouse deleted' });
  } catch (err) { next(err); }
};

// POST /api/warehouses/:id/set-default
export const setDefaultWarehouse = async (req, res, next) => {
  try {
    // Unset all defaults for this company
    await Warehouse.updateMany({ company: req.user.company }, { isDefault: false });

    const warehouse = await Warehouse.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isDefault: true },
      { new: true }
    );
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.json({ success: true, message: `"${warehouse.name}" is now the default warehouse`, data: warehouse });
  } catch (err) { next(err); }
};
