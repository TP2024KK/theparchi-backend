import express from 'express';
import {
  getLocations, getLocation, createLocation,
  updateLocation, deleteLocation
} from '../controllers/locationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getLocations).post(createLocation);
router.route('/:id').get(getLocation).put(updateLocation).delete(deleteLocation);

export default router;
