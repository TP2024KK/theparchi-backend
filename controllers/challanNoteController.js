import ChallanNote from '../models/ChallanNote.js';
import Challan from '../models/Challan.js';
import Company from '../models/Company.js';
import nodemailer from 'nodemailer';

// ─── Email helper (reuses your existing env vars) ────────────────────────────
const sendNoteEmail = async ({ toEmails, challanNumber, noteText, authorName, companyName }) => {
  // Skip if no recipients or no email config
  if (!toEmails || toEmails.length === 0) return false;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;

  try {
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: #1976d2; padding: 20px 24px;">
          <h2 style="color: white; margin: 0; font-size: 18px;">📋 New Note on Challan ${challanNumber}</h2>
          <p style="color: #bbdefb; margin: 4px 0 0 0; font-size: 14px;">${companyName}</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #555; margin: 0 0 16px 0; font-size: 14px;">
            <strong>${authorName}</strong> added a note to challan <strong>${challanNumber}</strong>:
          </p>
          <div style="background: #f5f5f5; border-left: 4px solid #1976d2; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px;">
            <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.6;">${noteText}</p>
          </div>
          <p style="color: #888; font-size: 12px; margin: 0;">
            This is an automated notification from TheParchi. Do not reply to this email.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"TheParchi" <${process.env.EMAIL_USER}>`,
      to: toEmails.join(', '),
      subject: `📋 New Note — Challan ${challanNumber} | ${companyName}`,
      html,
    });

    return true;
  } catch (err) {
    console.error('Note email send failed:', err.message);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Get all notes for a challan
// @route  GET /api/challan-notes/:challanId
// @access Private
// ─────────────────────────────────────────────────────────────────────────────
export const getNotes = async (req, res, next) => {
  try {
    const { challanId } = req.params;

    // Make sure the challan belongs to this company
    const challan = await Challan.findOne({ _id: challanId, company: req.user.company });
    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    const notes = await ChallanNote.find({ challan: challanId, company: req.user.company })
      .populate('author', 'name email')
      .sort({ createdAt: -1 }); // newest first

    res.json({ success: true, data: notes, count: notes.length });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Add a note to a challan
// @route  POST /api/challan-notes/:challanId
// @access Private
// ─────────────────────────────────────────────────────────────────────────────
export const addNote = async (req, res, next) => {
  try {
    const { challanId } = req.params;
    const { text, notifyEmails = [] } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }

    // Verify challan belongs to this company
    const challan = await Challan.findOne({ _id: challanId, company: req.user.company })
      .populate('party', 'name email');
    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    // Create the note
    const note = await ChallanNote.create({
      challan: challanId,
      company: req.user.company,
      author: req.user.id,
      text: text.trim(),
      notifyEmails,
      emailSent: false
    });

    await note.populate('author', 'name email');

    // Send email notification in background (don't block the response)
    if (notifyEmails.length > 0) {
      const company = await Company.findById(req.user.company);
      sendNoteEmail({
        toEmails: notifyEmails,
        challanNumber: challan.challanNumber,
        noteText: text.trim(),
        authorName: req.user.name || note.author.name,
        companyName: company?.name || 'TheParchi',
      }).then(sent => {
        if (sent) {
          ChallanNote.updateOne({ _id: note._id }, { emailSent: true, emailSentAt: new Date() }).catch(() => {});
        }
      });
    }

    res.status(201).json({
      success: true,
      message: notifyEmails.length > 0 ? 'Note added & email notification sent!' : 'Note added!',
      data: note
    });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Delete a note (only by author)
// @route  DELETE /api/challan-notes/:noteId
// @access Private
// ─────────────────────────────────────────────────────────────────────────────
export const deleteNote = async (req, res, next) => {
  try {
    const note = await ChallanNote.findOne({ _id: req.params.noteId, company: req.user.company });
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    // Only the note author can delete it
    if (note.author.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the note author can delete it' });
    }

    await note.deleteOne();
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) { next(error); }
};
