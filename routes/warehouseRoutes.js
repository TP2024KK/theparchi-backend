import express from 'express';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, setDefaultWarehouse } from '../controllers/warehouseController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getWarehouses).post(createWarehouse);
router.route('/:id').put(updateWarehouse).delete(deleteWarehouse);
router.post('/:id/set-default', setDefaultWarehouse);

export default router;
