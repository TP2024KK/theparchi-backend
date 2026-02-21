import os from 'os';
import mongoose from 'mongoose';
import SystemHealth from '../models/SystemHealth.js';

// In-memory counters — reset each collection cycle
let _reqCount = 0;
let _errCount = 0;
let _totalMs = 0;
let _intervalStart = Date.now();

/**
 * Passive middleware — tracks request counts, response times, error rate.
 * Registered in app.js. Has zero effect on any existing route behaviour.
 */
export const requestTracker = (req, res, next) => {
  const start = Date.now();
  _reqCount++;
  res.on('finish', () => {
    _totalMs += Date.now() - start;
    if (res.statusCode >= 500) _errCount++;
  });
  next();
};

/**
 * Collect a live snapshot of all metrics.
 */
export const collectMetrics = async () => {
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const cpuPercent = Math.min(100, Math.round((os.loadavg()[0] / os.cpus().length) * 100));

  // DB ping
  let dbStatus = 'down';
  let dbMs = null;
  try {
    const t = Date.now();
    await mongoose.connection.db.admin().ping();
    dbMs = Date.now() - t;
    dbStatus = dbMs < 500 ? 'healthy' : 'degraded';
  } catch { /* stays 'down' */ }

  // Business counts from your existing models
  let business = {};
  try {
    const Company = mongoose.model('Company');
    const User = mongoose.model('User');
    const [total, active, suspended, totalUsers, activeUsers] = await Promise.all([
      Company.countDocuments(),
      Company.countDocuments({ status: 'active' }),
      Company.countDocuments({ status: 'suspended' }),
      User.countDocuments({ isSuperAdmin: { $ne: true } }),
      User.countDocuments({ isActive: true, isSuperAdmin: { $ne: true } }),
    ]);
    business = { totalCompanies: total, activeCompanies: active, suspendedCompanies: suspended, totalUsers, activeUsers };
  } catch { /* models not ready yet */ }

  // Request stats
  const elapsed = Date.now() - _intervalStart;
  const rpm = Math.round((_reqCount / Math.max(elapsed, 1)) * 60000);
  const avgMs = _reqCount > 0 ? Math.round(_totalMs / _reqCount) : 0;
  const errRate = _reqCount > 0 ? Math.round((_errCount / _reqCount) * 10000) / 100 : 0;

  // Reset counters for next interval
  _reqCount = 0; _errCount = 0; _totalMs = 0; _intervalStart = Date.now();

  const memPct = Math.round(((totalMem - os.freemem()) / totalMem) * 100);

  const alerts = [];
  if (dbStatus === 'down') alerts.push({ type: 'DB_DOWN', message: 'Database is unreachable', severity: 'critical' });
  else if (dbStatus === 'degraded') alerts.push({ type: 'DB_SLOW', message: `DB response: ${dbMs}ms`, severity: 'warning' });
  if (cpuPercent > 85) alerts.push({ type: 'HIGH_CPU', message: `CPU at ${cpuPercent}%`, severity: 'warning' });
  if (memPct > 90) alerts.push({ type: 'HIGH_MEMORY', message: `Memory at ${memPct}%`, severity: 'critical' });
  if (errRate > 10) alerts.push({ type: 'HIGH_ERRORS', message: `Error rate at ${errRate}%`, severity: 'warning' });

  const overallStatus = alerts.some(a => a.severity === 'critical') ? 'critical'
    : alerts.some(a => a.severity === 'warning') ? 'degraded' : 'healthy';

  return {
    recordedAt: new Date(),
    database: { status: dbStatus, responseTimeMs: dbMs },
    app: {
      uptime: Math.round(process.uptime()),
      memoryUsedBytes: mem.rss,
      memoryTotalBytes: totalMem,
      cpuPercent,
      nodeVersion: process.version,
      requestsPerMinute: rpm,
      avgResponseTimeMs: avgMs,
      errorRatePercent: errRate,
    },
    business,
    alerts,
    overallStatus,
  };
};

const saveSnapshot = async () => {
  try {
    const metrics = await collectMetrics();
    await SystemHealth.create(metrics);
    // Keep only last 1440 snapshots (24h at 1/min)
    const count = await SystemHealth.countDocuments();
    if (count > 1440) {
      const old = await SystemHealth.find().sort({ recordedAt: 1 }).limit(count - 1440).select('_id');
      await SystemHealth.deleteMany({ _id: { $in: old.map(d => d._id) } });
    }
  } catch (err) {
    console.error('[SystemHealth]', err.message);
  }
};

/**
 * Call once from app.js to start collecting snapshots every 60 seconds.
 */
export const startHealthCron = (ms = 60000) => {
  console.log('[SystemHealth] Collecting metrics every 60s');
  saveSnapshot(); // immediate first snapshot
  const timer = setInterval(saveSnapshot, ms);
  process.on('SIGTERM', () => clearInterval(timer));
  process.on('SIGINT', () => clearInterval(timer));
  return timer;
};
