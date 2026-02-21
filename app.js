import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import errorHandler from './middleware/errorHandler.js';

// Existing routes
import authRoutes from './routes/authRoutes.js';
import challanRoutes from './routes/challanRoutes.js';
import returnChallanRoutes from './routes/returnChallanRoutes.js';
import receivedChallanRoutes from './routes/receivedChallanRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import partyRoutes from './routes/partyRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import challanNoteRoutes from './routes/challanNoteRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import warehouseRoutes from './routes/warehouseRoutes.js';
import stockMovementRoutes from './routes/stockMovementRoutes.js';

// Phase 2 — super admin features
import auditLogRoutes from './routes/auditLogRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import usageLimitRoutes from './routes/usageLimitRoutes.js';

// Phase 3 — subscriptions
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import superAdminBillingRoutes from './routes/superAdminBillingRoutes.js';

// Services
import { requestTracker, startHealthCron } from './services/systemHealth.service.js';
import { startSubscriptionCron } from './services/subscriptionCron.service.js';

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.includes('onrender.com') || origin.includes('vercel.app') || origin.includes('netlify.app')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Raw body needed for Razorpay webhook signature verification
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Phase 2 — request tracker
app.use(requestTracker);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'TheParchi API is running',
    timestamp: new Date().toISOString()
  });
});

// ── Existing Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/challans', challanRoutes);
app.use('/api/return-challans', returnChallanRoutes);
app.use('/api/received-challans', receivedChallanRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/challan-notes', challanNoteRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/stock-movements', stockMovementRoutes);

// ── Phase 2 Routes ────────────────────────────────────────────────────────────
app.use('/api/superadmin/audit-logs', auditLogRoutes);
app.use('/api/superadmin/health', healthRoutes);
app.use('/api/superadmin/usage-limits', usageLimitRoutes);

// ── Phase 3 Routes ────────────────────────────────────────────────────────────
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/superadmin/billing', superAdminBillingRoutes);

// ── Start background services ─────────────────────────────────────────────────
startHealthCron();         // collect health snapshot every 60s
startSubscriptionCron();   // check expired subscriptions daily

// 404
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use(errorHandler);

export default app;
