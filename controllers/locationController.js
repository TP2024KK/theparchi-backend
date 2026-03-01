import Location from '../models/Location.js';
import Warehouse from '../models/Warehouse.js';

// GET /api/locations?warehouseId=xxx
export const getLocations = async (req, res, next) => {
  try {
    const { warehouseId } = req.query;
    const query = { company: req.user.company, isActive: true };
    if (warehouseId) query.warehouse = warehouseId;

    const locations = await Location.find(query)
      .populate('warehouse', 'name code')
      .sort({ warehouse: 1, name: 1 });

    res.json({ success: true, data: locations });
  } catch (err) { next(err); }
};

// GET /api/locations/:id
export const getLocation = async (req, res, next) => {
  try {
    const location = await Location.findOne({ _id: req.params.id, company: req.user.company })
      .populate('warehouse', 'name code');
    if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
    res.json({ success: true, data: location });
  } catch (err) { next(err); }
};

// POST /api/locations
export const createLocation = async (req, res, next) => {
  try {
    const { warehouseId, name, code, description, notes } = req.body;
    if (!warehouseId) return res.status(400).json({ success: false, message: 'Warehouse is required' });
    if (!name) return res.status(400).json({ success: false, message: 'Location name is required' });

    // Verify warehouse belongs to company
    const warehouse = await Warehouse.findOne({ _id: warehouseId, company: req.user.company, isActive: true });
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });

    // Check duplicate name in same warehouse
    const existing = await Location.findOne({
      company: req.user.company,
      warehouse: warehouseId,
      name: name.trim(),
      isActive: true
    });
    if (existing) return res.status(400).json({ success: false, message: `Location "${name}" already exists in this warehouse` });

    const location = await Location.create({
      company: req.user.company,
      warehouse: warehouseId,
      name: name.trim(),
      code: code?.trim().toUpperCase() || '',
      description: description || '',
      notes: notes || ''
    });

    await location.populate('warehouse', 'name code');
    res.status(201).json({ success: true, message: 'Location created!', data: location });
  } catch (err) { next(err); }
};

// PUT /api/locations/:id
export const updateLocation = async (req, res, next) => {
  try {
    const { name, code, description, notes } = req.body;

    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { name, code: code?.toUpperCase(), description, notes },
      { new: true }
    ).populate('warehouse', 'name code');

    if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
    res.json({ success: true, message: 'Location updated!', data: location });
  } catch (err) { next(err); }
};

// DELETE /api/locations/:id
export const deleteLocation = async (req, res, next) => {
  try {
    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false },
      { new: true }
    );
    if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
    res.json({ success: true, message: 'Location deleted' });
  } catch (err) { next(err); }
};
