import HrvData from '../models/HrvData.js';

// Store HRV data for 5-minute intervals
export const storeHrvData = async (req, res) => {
  try {
    const { hrvIntervals } = req.body;
    const userId = req.body.userId || 'default_user';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (!hrvIntervals || !Array.isArray(hrvIntervals)) {
      return res.status(400).json({ 
        success: false, 
        message: 'hrvIntervals array is required' 
      });
    }

    const savedData = [];
    
    for (const interval of hrvIntervals) {
      const { intervalStart, intervalEnd, timeLabel, hrvValue } = interval;
      
      // Upsert HRV data (update if exists, create if not)
      const hrvData = await HrvData.findOneAndUpdate(
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
          hrvValue: hrvValue || 0
        },
        { 
          upsert: true, 
          new: true,
          runValidators: true 
        }
      );
      
      savedData.push(hrvData);
    }

    res.status(200).json({
      success: true,
      message: `Stored ${savedData.length} HRV intervals`,
      data: savedData
    });
    
  } catch (error) {
    console.error('Error storing HRV data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to store HRV data',
      error: error.message 
    });
  }
};

// Get HRV data for a specific date
export const getHrvData = async (req, res) => {
  try {
    const { date } = req.params; // YYYY-MM-DD format
    const userId = req.query.userId || 'default_user';
    
    const hrvData = await HrvData.find({
      userId,
      date
    }).sort({ intervalStart: 1 });
    
    res.status(200).json({
      success: true,
      data: hrvData,
      avgHrv: hrvData.length > 0 
        ? hrvData.reduce((sum, interval) => sum + interval.hrvValue, 0) / hrvData.length 
        : 0
    });
    
  } catch (error) {
    console.error('Error fetching HRV data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch HRV data',
      error: error.message 
    });
  }
};

// Get today's HRV data
export const getTodayHrvData = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const userId = req.query.userId || 'default_user';
    
    const hrvData = await HrvData.find({
      userId,
      date: today
    }).sort({ intervalStart: 1 });
    
    res.status(200).json({
      success: true,
      date: today,
      data: hrvData,
      avgHrv: hrvData.length > 0 
        ? hrvData.reduce((sum, interval) => sum + interval.hrvValue, 0) / hrvData.length 
        : 0
    });
    
  } catch (error) {
    console.error('Error fetching today\'s HRV data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch today\'s HRV data',
      error: error.message 
    });
  }
};