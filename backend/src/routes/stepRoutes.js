import express from 'express';
import { storeStepData, getStepData, getTodayStepData } from '../controllers/stepController.js';

const router = express.Router();

// POST /api/steps - Store step data
router.post('/', storeStepData);

// GET /api/steps/today - Get today's step data
router.get('/today', getTodayStepData);

// GET /api/steps/:date - Get step data for specific date
router.get('/:date', getStepData);

export default router;