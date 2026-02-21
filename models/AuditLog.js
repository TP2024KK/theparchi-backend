import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      email: String,
      name: String,
      role: String,
      ip: String,
    },

    company: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      name: String,
    },

    action: {
      type: String,
      required: true,
      enum: [
        'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_FAILED_LOGIN', 'AUTH_PASSWORD_RESET',
        'SUPER_ADMIN_LOGIN', 'SUPER_ADMIN_LOGOUT',
        'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_DELETED',
        'COMPANY_SUSPENDED', 'COMPANY_REACTIVATED',
        'COMPANY_PLAN_CHANGED', 'COMPANY_LIMIT_UPDATED',
        'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
        'USER_SUSPENDED', 'USER_REACTIVATED',
        'USER_ROLE_CHANGED', 'USER_PASSWORD_RESET',
        'INVITE_SENT', 'INVITE_ACCEPTED', 'INVITE_REVOKED',
        'DATA_EXPORTED', 'DATA_DELETED',
        'SETTINGS_UPDATED',
        'SYSTEM_CONFIG_CHANGED',
        'USAGE_LIMIT_ENFORCED', 'USAGE_LIMIT_WARNING', 'USAGE_LIMIT_RESET',
      ],
    },

    status: {
      type: String,
      enum: ['success', 'failure', 'warning'],
      default: 'success',
    },

    description: String,

    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },

    resource: {
      type: { type: String },
      id: mongoose.Schema.Types.ObjectId,
      name: String,
    },

    metadata: mongoose.Schema.Types.Mixed,

    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ 'actor.id': 1, createdAt: -1 });
auditLogSchema.index({ 'company.id': 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ status: 1 });

// Never throws — logging must never break the main request flow
auditLogSchema.statics.log = async function (params) {
  try {
    await this.create(params);
  } catch (err) {
    console.error('[AuditLog] Failed to write:', err.message);
  }
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
