import mongoose from 'mongoose';

const usageLimitSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },

    limits: {
      maxUsers: { type: Number, default: 5 },
      maxInvitesPerMonth: { type: Number, default: 50 },
      maxStorageMb: { type: Number, default: 500 },
      maxApiCallsPerDay: { type: Number, default: 1000 },
      maxChallansPerMonth: { type: Number, default: 100 },
    },

    current: {
      users: { type: Number, default: 0 },
      invitesSentThisMonth: { type: Number, default: 0 },
      storageUsedMb: { type: Number, default: 0 },
      apiCallsToday: { type: Number, default: 0 },
      challansThisMonth: { type: Number, default: 0 },
    },

    resets: {
      monthly: Date,
      daily: Date,
    },

    enforcement: {
      hardBlock: { type: Boolean, default: true },
      warnAtPercent: { type: Number, default: 80 },
    },

    overages: [
      {
        resource: String,
        detectedAt: Date,
        limitAt: Number,
        usageAt: Number,
        resolved: { type: Boolean, default: false },
        action: { type: String, enum: ['blocked', 'warned', 'allowed'], default: 'blocked' },
      },
    ],

    overrides: {
      active: { type: Boolean, default: false },
      reason: String,
      expiresAt: Date,
      grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true }
);

const UsageLimit = mongoose.model('UsageLimit', usageLimitSchema);
export default UsageLimit;
