import express from 'express';
import { storeHeartRateData, getHeartRateData, getTodayHeartRateData } from '../controllers/heartRateController.js';

const router = express.Router();

// POST /api/heartrate - Store Heart Rate data
router.post('/', storeHeartRateData);

// GET /api/heartrate/today - Get today's Heart Rate data
router.get('/today', getTodayHeartRateData);

// GET /api/heartrate/:date - Get Heart Rate data for specific date
router.get('/:date', getHeartRateData);

export default router;