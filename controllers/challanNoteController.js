import ChallanNote from '../models/ChallanNote.js';
import Challan from '../models/Challan.js';
import Company from '../models/Company.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Email helper using Resend (same as your email.js) ────────────────────────
const sendNoteEmail = async ({ toEmails, challanNumber, noteText, authorName, companyName }) => {
  if (!toEmails || toEmails.length === 0) return false;

  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
          
          <div style="background:#1976d2;padding:25px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">📋 New Note on Challan ${challanNumber}</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">${companyName}</p>
          </div>

          <div style="padding:25px">
            <p style="font-size:15px;color:#333">
              <strong>${authorName}</strong> added a note to challan <strong>${challanNumber}</strong>:
            </p>

            <div style="background:#f0f4ff;border-left:4px solid #1976d2;border-radius:4px;padding:16px 20px;margin:20px 0">
              <p style="margin:0;color:#333;font-size:15px;line-height:1.6">${noteText}</p>
            </div>

            <p style="color:#888;font-size:12px;border-top:1px solid #eee;padding-top:15px;margin-top:20px">
              This is an automated notification from TheParchi. Do not reply to this email.<br>
              Powered by <strong>TheParchi</strong>
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: `${process.env.FROM_NAME || 'TheParchi'} <${process.env.FROM_EMAIL}>`,
      to: toEmails,
      subject: `📋 New Note — Challan ${challanNumber} | ${companyName}`,
      html,
    });

    if (error) {
      console.error('Note email error:', error);
      return false;
    }

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

    const challan = await Challan.findOne({ _id: challanId, company: req.user.company })
      .populate('party', 'name email');
    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    const note = await ChallanNote.create({
      challan: challanId,
      company: req.user.company,
      author: req.user.id,
      text: text.trim(),
      notifyEmails,
      emailSent: false
    });

    await note.populate('author', 'name email');

    // Send email in background — don't block the response
    if (notifyEmails.length > 0) {
      const company = await Company.findById(req.user.company);
      sendNoteEmail({
        toEmails: notifyEmails,
        challanNumber: challan.challanNumber,
        noteText: text.trim(),
        authorName: note.author?.name || 'Team Member',
        companyName: company?.name || 'TheParchi',
      }).then(sent => {
        if (sent) {
          ChallanNote.updateOne(
            { _id: note._id },
            { emailSent: true, emailSentAt: new Date() }
          ).catch(() => {});
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
// @route  DELETE /api/challan-notes/note/:noteId
// @access Private
// ─────────────────────────────────────────────────────────────────────────────
export const deleteNote = async (req, res, next) => {
  try {
    const note = await ChallanNote.findOne({ _id: req.params.noteId, company: req.user.company });
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    if (note.author.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the note author can delete it' });
    }

    await note.deleteOne();
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) { next(error); }
};
