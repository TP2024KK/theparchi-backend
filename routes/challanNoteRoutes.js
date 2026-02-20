import express from 'express';
import { getNotes, addNote, deleteNote } from '../controllers/challanNoteController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/:challanId', getNotes);
router.post('/:challanId', addNote);
router.delete('/note/:noteId', deleteNote);

export default router;
