import mongoose from 'mongoose';

const heartRateDataSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    default: 'default_user' // For now using default user
  },
  date: {
    type: String,
    required: true // Format: YYYY-MM-DD
  },
  intervalStart: {
    type: Date,
    required: true
  },
  intervalEnd: {
    type: Date,
    required: true
  },
  timeLabel: {
    type: String,
    required: true // e.g., "10:25 AM"
  },
  heartRateValue: {
    type: Number,
    required: true,
    default: 0 // Heart rate in BPM
  },
  deviceSource: {
    type: String,
    default: 'health_connect'
  }
}, {
  timestamps: true
});

// Create compound index for efficient queries
heartRateDataSchema.index({ userId: 1, date: 1, intervalStart: 1 }, { unique: true });
heartRateDataSchema.index({ userId: 1, date: 1 });

export default mongoose.model('HeartRateData', heartRateDataSchema);