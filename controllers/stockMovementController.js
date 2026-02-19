import StockMovement from '../models/StockMovement.js';

// GET /api/stock-movements
export const getStockMovements = async (req, res, next) => {
  try {
    const { item, type, reason, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = { company: req.user.company };
    if (item) query.item = item;
    if (type) query.type = type;
    if (reason) query.reason = reason;
    if (startDate || endDate) {
      query.movementDate = {};
      if (startDate) query.movementDate.$gte = new Date(startDate);
      if (endDate) query.movementDate.$lte = new Date(endDate + 'T23:59:59');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [movements, total] = await Promise.all([
      StockMovement.find(query)
        .populate('item', 'name sku unit')
        .populate('performedBy', 'name')
        .populate('relatedChallan', 'challanNumber')
        .sort({ movementDate: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      StockMovement.countDocuments(query)
    ]);

    res.json({ success: true, data: movements, total, page: parseInt(page) });
  } catch (error) { next(error); }
};

// GET /api/stock-movements/summary
export const getMovementSummary = async (req, res, next) => {
  try {
    const summary = await StockMovement.aggregate([
      { $match: { company: req.user.company } },
      { $group: { _id: { type: '$type', reason: '$reason' }, count: { $sum: 1 }, totalQty: { $sum: '$quantity' }, totalValue: { $sum: '$totalValue' } } }
    ]);
    res.json({ success: true, data: summary });
  } catch (error) { next(error); }
};
