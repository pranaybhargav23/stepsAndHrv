import StepData from '../models/StepData.js';

// Store step data for 5-minute intervals
export const storeStepData = async (req, res) => {
  try {
    const { stepIntervals } = req.body;
    const userId = req.body.userId || 'default_user';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (!stepIntervals || !Array.isArray(stepIntervals)) {
      return res.status(400).json({ 
        success: false, 
        message: 'stepIntervals array is required' 
      });
    }

    const savedData = [];
    
    for (const interval of stepIntervals) {
      const { intervalStart, intervalEnd, timeLabel, stepCount } = interval;
      
      // Upsert step data (update if exists, create if not)
      const stepData = await StepData.findOneAndUpdate(
        {
          userId,
          date: today,
          intervalStart: new Date(intervalStart)
        },
        {
          userId,
          date: today,
          intervalStart: new Date(intervalStart),
          intervalEnd: new Date(intervalEnd),
          timeLabel,
          stepCount: stepCount || 0
        },
        { 
          upsert: true, 
          new: true,
          runValidators: true 
        }
      );
      
      savedData.push(stepData);
    }

    res.status(200).json({
      success: true,
      message: `Stored ${savedData.length} step intervals`,
      data: savedData
    });
    
  } catch (error) {
    console.error('Error storing step data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to store step data',
      error: error.message 
    });
  }
};

// Get step data for a specific date
export const getStepData = async (req, res) => {
  try {
    const { date } = req.params; // YYYY-MM-DD format
    const userId = req.query.userId || 'default_user';
    
    const stepData = await StepData.find({
      userId,
      date
    }).sort({ intervalStart: 1 });
    
    res.status(200).json({
      success: true,
      data: stepData,
      totalSteps: stepData.reduce((sum, interval) => sum + interval.stepCount, 0)
    });
    
  } catch (error) {
    console.error('Error fetching step data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch step data',
      error: error.message 
    });
  }
};

// Get today's step data
export const getTodayStepData = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const userId = req.query.userId || 'default_user';
    
    const stepData = await StepData.find({
      userId,
      date: today
    }).sort({ intervalStart: 1 });
    
    res.status(200).json({
      success: true,
      date: today,
      data: stepData,
      totalSteps: stepData.reduce((sum, interval) => sum + interval.stepCount, 0)
    });
    
  } catch (error) {
    console.error('Error fetching today\'s step data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch today\'s step data',
      error: error.message 
    });
  }
};