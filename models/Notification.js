import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // specific user, null = all company users
  type: {
    type: String,
    enum: [
      'challan_accepted', 'challan_rejected',
      'return_challan_received', 'return_challan_acknowledged',
      'margin_accepted', 'challan_received'
    ]
  },
  title: String,
  message: String,
  link: String, // frontend route to navigate to
  relatedChallan: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan' },
  relatedReturnChallan: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnChallan' },
  isRead: { type: Boolean, default: false },
  fromCompany: String, // name of company that triggered notification
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
