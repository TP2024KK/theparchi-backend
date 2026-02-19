import Warehouse from '../models/Warehouse.js';

// GET /api/warehouses
export const getWarehouses = async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find({ company: req.user.company, isActive: true }).sort({ isDefault: -1, name: 1 });
    res.json({ success: true, data: warehouses });
  } catch (error) { next(error); }
};

// POST /api/warehouses
export const createWarehouse = async (req, res, next) => {
  try {
    const { name, code, address, contactPerson, phone, isDefault } = req.body;

    // If setting as default, unset existing default
    if (isDefault) {
      await Warehouse.updateMany({ company: req.user.company }, { isDefault: false });
    }

    // If first warehouse, make it default
    const count = await Warehouse.countDocuments({ company: req.user.company, isActive: true });

    const warehouse = await Warehouse.create({
      company: req.user.company,
      name, code, address, contactPerson, phone,
      isDefault: isDefault || count === 0
    });

    res.status(201).json({ success: true, message: 'Warehouse created!', data: warehouse });
  } catch (error) { next(error); }
};

// PUT /api/warehouses/:id
export const updateWarehouse = async (req, res, next) => {
  try {
    const { name, code, address, contactPerson, phone, isDefault } = req.body;

    if (isDefault) {
      await Warehouse.updateMany({ company: req.user.company }, { isDefault: false });
    }

    const warehouse = await Warehouse.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { name, code, address, contactPerson, phone, isDefault },
      { new: true }
    );
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.json({ success: true, message: 'Warehouse updated!', data: warehouse });
  } catch (error) { next(error); }
};

// DELETE /api/warehouses/:id
export const deleteWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findOne({ _id: req.params.id, company: req.user.company });
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    if (warehouse.isDefault) return res.status(400).json({ success: false, message: 'Cannot delete default warehouse. Set another as default first.' });
    warehouse.isActive = false;
    await warehouse.save();
    res.json({ success: true, message: 'Warehouse removed' });
  } catch (error) { next(error); }
};

// POST /api/warehouses/:id/set-default
export const setDefaultWarehouse = async (req, res, next) => {
  try {
    await Warehouse.updateMany({ company: req.user.company }, { isDefault: false });
    const warehouse = await Warehouse.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isDefault: true },
      { new: true }
    );
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.json({ success: true, message: 'Default warehouse updated!', data: warehouse });
  } catch (error) { next(error); }
};
