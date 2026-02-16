import Notification from '../models/Notification.js';

// @desc  Get all notifications for company
// @route GET /api/notifications
export const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ company: req.user.company })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      company: req.user.company,
      isRead: false
    });

    res.json({ success: true, data: notifications, unreadCount });
  } catch (err) { next(err); }
};

// @desc  Mark notifications as read
// @route PUT /api/notifications/read-all
export const markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { company: req.user.company, isRead: false },
      { isRead: true }
    );
    res.json({ success: true, message: 'All marked as read' });
  } catch (err) { next(err); }
};

// @desc  Mark single notification as read
// @route PUT /api/notifications/:id/read
export const markRead = async (req, res, next) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (err) { next(err); }
};
