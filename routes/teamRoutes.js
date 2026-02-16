import express from 'express';
import { getTeamMembers, addTeamMember, updateTeamMember, removeTeamMember, getSFPRecipients, sendForProcessing, getMyPermissions, resetMemberPassword } from '../controllers/teamController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/my-permissions', getMyPermissions);
router.get('/sfp-recipients', getSFPRecipients);
router.post('/sfp/:challanId', sendForProcessing);
router.route('/').get(getTeamMembers).post(addTeamMember);
router.route('/:id').put(updateTeamMember).delete(removeTeamMember);
router.put('/:id/reset-password', resetMemberPassword);

export default router;
