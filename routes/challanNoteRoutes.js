import express from 'express';
import { getNotes, addNote, deleteNote } from '../controllers/challanNoteController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require login
router.use(protect);

// GET  /api/challan-notes/:challanId  → get all notes for a challan
// POST /api/challan-notes/:challanId  → add a note to a challan
router.route('/:challanId')
  .get(getNotes)
  .post(addNote);

// DELETE /api/challan-notes/:noteId  → delete a specific note
router.delete('/note/:noteId', deleteNote);

export default router;
