import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import errorHandler from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import challanRoutes from './routes/challanRoutes.js';
import returnChallanRoutes from './routes/returnChallanRoutes.js';
import receivedChallanRoutes from './routes/receivedChallanRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import partyRoutes from './routes/partyRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import publicRoutes from './routes/publicRoutes.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS - Allow multiple origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Also allow any onrender.com or vercel.app domain
    if (origin.includes('onrender.com') || origin.includes('vercel.app') || origin.includes('netlify.app')) {
      return callback(null, true);
    }
    return callback(null, true); // Allow all for now during development
  },
  credentials: true
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'TheParchi API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/challans', challanRoutes);
app.use('/api/return-challans', returnChallanRoutes);
app.use('/api/received-challans', receivedChallanRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/public', publicRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
