import Payment from '../models/Payment.js';
import Challan from '../models/Challan.js';

// Helper: compute payment summary for a challan
const getPaymentSummary = async (challanId, grandTotal) => {
  const payments = await Payment.find({ challan: challanId }).sort({ paymentDate: 1 });
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = grandTotal - totalPaid;
  let paymentStatus = 'unpaid';
  if (totalPaid >= grandTotal) paymentStatus = 'paid';
  else if (totalPaid > 0) paymentStatus = 'partial';
  return { payments, totalPaid, balance, paymentStatus };
};

// @desc  Get payments for a challan
// @route GET /api/payments/:challanId
export const getPayments = async (req, res, next) => {
  try {
    const challan = await Challan.findById(req.params.challanId);
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });

    const { payments, totalPaid, balance, paymentStatus } = await getPaymentSummary(challan._id, challan.grandTotal);

    await Payment.populate(payments, { path: 'recordedBy', select: 'name' });

    res.json({
      success: true,
      data: {
        payments,
        summary: {
          grandTotal: challan.grandTotal,
          totalPaid,
          balance,
          paymentStatus
        }
      }
    });
  } catch (error) { next(error); }
};

// @desc  Add a payment to a challan
// @route POST /api/payments/:challanId
export const addPayment = async (req, res, next) => {
  try {
    const { amount, mode, paymentDate, reference, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required' });
    }
    if (!mode) {
      return res.status(400).json({ success: false, message: 'Payment mode is required' });
    }

    const challan = await Challan.findById(req.params.challanId);
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });

    // Check overpayment
    const { totalPaid } = await getPaymentSummary(challan._id, challan.grandTotal);
    const numAmount = Number(amount);
    if (totalPaid + numAmount > challan.grandTotal * 1.01) { // 1% tolerance
      return res.status(400).json({
        success: false,
        message: `Payment of ₹${amount} would exceed challan total ₹${challan.grandTotal}. Balance due: ₹${(challan.grandTotal - totalPaid).toFixed(2)}`
      });
    }

    const payment = await Payment.create({
      company: req.user.company,
      challan: challan._id,
      amount: numAmount,
      mode,
      paymentDate: paymentDate || new Date(),
      reference,
      notes,
      recordedBy: req.user.id
    });

    await payment.populate('recordedBy', 'name');

    // Return updated summary
    const summary = await getPaymentSummary(challan._id, challan.grandTotal);

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully!',
      data: { payment, summary: { grandTotal: challan.grandTotal, ...summary } }
    });
  } catch (error) { next(error); }
};

// @desc  Delete a payment
// @route DELETE /api/payments/:paymentId
export const deletePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.paymentId, company: req.user.company });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    const challan = await Challan.findById(payment.challan);
    await payment.deleteOne();

    const summary = await getPaymentSummary(payment.challan, challan?.grandTotal || 0);

    res.json({
      success: true,
      message: 'Payment deleted',
      data: { summary: { grandTotal: challan?.grandTotal, ...summary } }
    });
  } catch (error) { next(error); }
};

// @desc  Get payment summary for multiple challans (batch - for table display)
// @route POST /api/payments/batch-summary
export const getBatchSummary = async (req, res, next) => {
  try {
    const { challanIds } = req.body;
    if (!challanIds?.length) return res.json({ success: true, data: {} });

    // Get all payments for these challans in one query
    const payments = await Payment.find({
      challan: { $in: challanIds },
      company: req.user.company
    });

    // Get challan totals
    const challans = await Challan.find({ _id: { $in: challanIds } }, 'grandTotal');
    const totalMap = {};
    challans.forEach(c => { totalMap[c._id.toString()] = c.grandTotal; });

    // Build summary per challan
    const summary = {};
    challanIds.forEach(id => {
      const challanPayments = payments.filter(p => p.challan.toString() === id.toString());
      const totalPaid = challanPayments.reduce((sum, p) => sum + p.amount, 0);
      const grandTotal = totalMap[id.toString()] || 0;
      const balance = grandTotal - totalPaid;
      let paymentStatus = 'unpaid';
      if (totalPaid >= grandTotal && grandTotal > 0) paymentStatus = 'paid';
      else if (totalPaid > 0) paymentStatus = 'partial';
      summary[id] = { totalPaid, balance, paymentStatus };
    });

    res.json({ success: true, data: summary });
  } catch (error) { next(error); }
};
