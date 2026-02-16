import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  canCreateChallan: { type: Boolean, default: false },
  canSendChallan: { type: Boolean, default: false },
  canDeleteChallan: { type: Boolean, default: false },
  canSFP: { type: Boolean, default: false }, // Send For Processing (internal)
  canCreateReturnChallan: { type: Boolean, default: false },
  canManageParties: { type: Boolean, default: false },
  canViewLedger: { type: Boolean, default: false },
  canManageTeam: { type: Boolean, default: false },
  canAccessSettings: { type: Boolean, default: false },
}, { _id: false });

const teamMemberSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: {
    type: String,
    enum: ['owner', 'admin', 'manager', 'staff', 'viewer'],
    default: 'staff'
  },
  permissions: { type: permissionSchema, default: () => ({}) },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tempPassword: String, // cleared after first login
  mustChangePassword: { type: Boolean, default: true },
}, { timestamps: true });

// Role default permissions
teamMemberSchema.statics.defaultPermissions = {
  owner: {
    canCreateChallan: true, canSendChallan: true, canDeleteChallan: true,
    canSFP: true, canCreateReturnChallan: true, canManageParties: true,
    canViewLedger: true, canManageTeam: true, canAccessSettings: true
  },
  admin: {
    canCreateChallan: true, canSendChallan: true, canDeleteChallan: true,
    canSFP: true, canCreateReturnChallan: true, canManageParties: true,
    canViewLedger: true, canManageTeam: true, canAccessSettings: false
  },
  manager: {
    canCreateChallan: true, canSendChallan: true, canDeleteChallan: false,
    canSFP: true, canCreateReturnChallan: true, canManageParties: true,
    canViewLedger: true, canManageTeam: false, canAccessSettings: false
  },
  staff: {
    canCreateChallan: true, canSendChallan: false, canDeleteChallan: false,
    canSFP: true, canCreateReturnChallan: false, canManageParties: false,
    canViewLedger: false, canManageTeam: false, canAccessSettings: false
  },
  viewer: {
    canCreateChallan: false, canSendChallan: false, canDeleteChallan: false,
    canSFP: false, canCreateReturnChallan: false, canManageParties: false,
    canViewLedger: true, canManageTeam: false, canAccessSettings: false
  }
};

const TeamMember = mongoose.model('TeamMember', teamMemberSchema);
export default TeamMember;
