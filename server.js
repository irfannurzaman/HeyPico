import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { placesRouter } from './routes/places.js';
import { mapsRouter } from './routes/maps.js';
import { usageRouter } from './routes/usage.js';
import { llmRouter } from './routes/llm.js';
import { connectRedis, isRedisConnected } from './services/cache.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://maps.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://maps.googleapis.com", "https://maps.gstatic.com"],
      connectSrc: ["'self'", "https://maps.googleapis.com"],
      frameSrc: ["'self'", "https://www.google.com"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080']
    : true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

app.get('/health', (req, res) => {
  const redisStatus = isRedisConnected();
  res.json({ 
    status: redisStatus ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    redis: redisStatus ? 'connected' : 'disconnected'
  });
});

app.use('/api/places', placesRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/usage', usageRouter);
app.use('/api/llm', llmRouter);

app.use(express.static('public'));

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  try {
    await connectRedis();
    console.log('✅ Redis connected successfully');
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.error('Redis is required. Please ensure Redis is running.');
    process.exit(1);
  }
  
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.warn('WARNING: GOOGLE_MAPS_API_KEY not set');
  }
});
