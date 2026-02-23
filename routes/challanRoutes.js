import express from 'express';
import { createChallan, getChallans, getChallan, updateChallan, deleteChallan, getChallanStats, sendChallan, selfActionChallan, sfpChallan, getSFPRecipients, fixChallanStatuses } from '../controllers/challanController.js';
import { validateBulkChallan, createBulkChallans, bulkSendChallans, getBulkSampleCSV } from '../controllers/bulkChallanController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/stats', getChallanStats);
router.get('/bulk-sample-csv', getBulkSampleCSV);
router.post('/bulk-validate', validateBulkChallan);
router.post('/bulk-create', createBulkChallans);
router.post('/bulk-send', bulkSendChallans);
router.post('/fix-statuses', fixChallanStatuses);
router.get('/sfp-recipients', getSFPRecipients);
router.post('/:id/send', sendChallan);
router.post('/:id/sfp', sfpChallan);
router.post('/:id/self-action', selfActionChallan);
router.route('/').get(getChallans).post(createChallan);
router.route('/:id').get(getChallan).put(updateChallan).delete(deleteChallan);

export default router;
