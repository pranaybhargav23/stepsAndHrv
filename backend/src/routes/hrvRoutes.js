import express from 'express';
import { storeHrvData, getHrvData, getTodayHrvData } from '../controllers/hrvController.js';

const router = express.Router();

// POST /api/hrv - Store HRV data
router.post('/', storeHrvData);

// GET /api/hrv/today - Get today's HRV data
router.get('/today', getTodayHrvData);

// GET /api/hrv/:date - Get HRV data for specific date
router.get('/:date', getHrvData);

export default router;