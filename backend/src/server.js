import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import stepRoutes from './routes/stepRoutes.js';
import hrvRoutes from './routes/hrvRoutes.js';
import heartRateRoutes from './routes/heartRateRoutes.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/steps', stepRoutes);
app.use('/api/hrv', hrvRoutes);
app.use('/api/heartrate', heartRateRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Server is running on http://0.0.0.0:3000');
  console.log('Server accessible on all network interfaces');
  connectDB();
});