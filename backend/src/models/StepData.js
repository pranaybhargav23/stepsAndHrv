import mongoose from 'mongoose';

const stepDataSchema = new mongoose.Schema({
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
  stepCount: {
    type: Number,
    required: true,
    default: 0
  },
  deviceSource: {
    type: String,
    default: 'health_connect'
  }
}, {
  timestamps: true
});

// Create compound index for efficient queries
stepDataSchema.index({ userId: 1, date: 1, intervalStart: 1 }, { unique: true });
stepDataSchema.index({ userId: 1, date: 1 });

export default mongoose.model('StepData', stepDataSchema);