import HeartRateData from '../models/HeartRateData.js';

// Store Heart Rate data for 5-minute intervals
export const storeHeartRateData = async (req, res) => {
  try {
    const { heartRateIntervals } = req.body;
    const userId = req.body.userId || 'default_user';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (!heartRateIntervals || !Array.isArray(heartRateIntervals)) {
      return res.status(400).json({ 
        success: false, 
        message: 'heartRateIntervals array is required' 
      });
    }

    const savedData = [];
    
    for (const interval of heartRateIntervals) {
      const { intervalStart, intervalEnd, timeLabel, heartRateValue } = interval;
      
      // Upsert Heart Rate data (update if exists, create if not)
      const heartRateData = await HeartRateData.findOneAndUpdate(
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
          heartRateValue: heartRateValue || 0
        },
        { 
          upsert: true, 
          new: true,
          runValidators: true 
        }
      );
      
      savedData.push(heartRateData);
    }

    res.status(200).json({
      success: true,
      message: `Stored ${savedData.length} Heart Rate intervals`,
      data: savedData
    });
    
  } catch (error) {
    console.error('Error storing Heart Rate data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to store Heart Rate data',
      error: error.message 
    });
  }
};

// Get Heart Rate data for a specific date
export const getHeartRateData = async (req, res) => {
  try {
    const { date } = req.params; // YYYY-MM-DD format
    const userId = req.query.userId || 'default_user';
    
    const heartRateData = await HeartRateData.find({
      userId,
      date
    }).sort({ intervalStart: 1 });
    
    res.status(200).json({
      success: true,
      data: heartRateData,
      avgHeartRate: heartRateData.length > 0 
        ? heartRateData.reduce((sum, interval) => sum + interval.heartRateValue, 0) / heartRateData.length 
        : 0
    });
    
  } catch (error) {
    console.error('Error fetching Heart Rate data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch Heart Rate data',
      error: error.message 
    });
  }
};

// Get today's Heart Rate data
export const getTodayHeartRateData = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const userId = req.query.userId || 'default_user';
    
    const heartRateData = await HeartRateData.find({
      userId,
      date: today
    }).sort({ intervalStart: 1 });
    
    res.status(200).json({
      success: true,
      date: today,
      data: heartRateData,
      avgHeartRate: heartRateData.length > 0 
        ? heartRateData.reduce((sum, interval) => sum + interval.heartRateValue, 0) / heartRateData.length 
        : 0
    });
    
  } catch (error) {
    console.error('Error fetching today\'s Heart Rate data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch today\'s Heart Rate data',
      error: error.message 
    });
  }
};