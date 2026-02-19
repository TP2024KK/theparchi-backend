import express from 'express';
import { getStockMovements, getMovementSummary } from '../controllers/stockMovementController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/summary', getMovementSummary);
router.get('/', getStockMovements);

export default router;
