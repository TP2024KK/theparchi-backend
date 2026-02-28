import express from 'express';
import {
  getWarehouses, getWarehouse, createWarehouse,
  updateWarehouse, deleteWarehouse, setDefaultWarehouse
} from '../controllers/warehouseController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getWarehouses).post(createWarehouse);
router.post('/:id/set-default', setDefaultWarehouse);
router.route('/:id').get(getWarehouse).put(updateWarehouse).delete(deleteWarehouse);

export default router;
