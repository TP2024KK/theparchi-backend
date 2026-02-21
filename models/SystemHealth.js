import mongoose from 'mongoose';

const systemHealthSchema = new mongoose.Schema(
  {
    recordedAt: { type: Date, default: Date.now, index: true },

    database: {
      status: { type: String, enum: ['healthy', 'degraded', 'down'], default: 'healthy' },
      responseTimeMs: Number,
    },

    app: {
      uptime: Number,
      memoryUsedBytes: Number,
      memoryTotalBytes: Number,
      cpuPercent: Number,
      nodeVersion: String,
      requestsPerMinute: Number,
      avgResponseTimeMs: Number,
      errorRatePercent: Number,
    },

    business: {
      totalCompanies: { type: Number, default: 0 },
      activeCompanies: { type: Number, default: 0 },
      suspendedCompanies: { type: Number, default: 0 },
      totalUsers: { type: Number, default: 0 },
      activeUsers: { type: Number, default: 0 },
    },

    alerts: [
      {
        type: { type: String },
        message: String,
        severity: { type: String, enum: ['info', 'warning', 'critical'] },
      },
    ],

    overallStatus: {
      type: String,
      enum: ['healthy', 'degraded', 'critical'],
      default: 'healthy',
    },
  },
  { timestamps: false }
);

const SystemHealth = mongoose.model('SystemHealth', systemHealthSchema);
export default SystemHealth;
