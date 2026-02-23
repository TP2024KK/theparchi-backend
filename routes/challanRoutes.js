import express from 'express';
import { createChallan, getChallans, getChallan, getChallanForViewer, updateChallan, deleteChallan, getChallanStats, sendChallan, selfActionChallan, sfpChallan, getSFPRecipients, fixChallanStatuses } from '../controllers/challanController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/stats', getChallanStats);
router.post('/fix-statuses', fixChallanStatuses);
router.get('/sfp-recipients', getSFPRecipients);
router.post('/:id/send', sendChallan);
router.post('/:id/sfp', sfpChallan);
router.post('/:id/self-action', selfActionChallan);
router.route('/').get(getChallans).post(createChallan);
router.get('/:id/view', getChallanForViewer);
router.route('/:id').get(getChallan).put(updateChallan).delete(deleteChallan);

export default router;
