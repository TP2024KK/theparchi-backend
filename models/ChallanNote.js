import mongoose from 'mongoose';

const challanNoteSchema = new mongoose.Schema({
  challan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challan',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  // Who to notify by email when this note is added
  notifyEmails: [{
    type: String,
    trim: true
  }],
  // Was an email notification actually sent?
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  }
}, {
  timestamps: true  // gives us createdAt and updatedAt automatically
});

// Index for fast lookup by challan
challanNoteSchema.index({ challan: 1, createdAt: -1 });
challanNoteSchema.index({ company: 1, createdAt: -1 });

const ChallanNote = mongoose.model('ChallanNote', challanNoteSchema);

export default ChallanNote;
