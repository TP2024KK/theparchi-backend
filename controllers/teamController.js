import TeamMember from '../models/TeamMember.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import bcrypt from 'bcryptjs';

// Helper: check if user is owner
const isOwner = async (userId, companyId) => {
  const member = await TeamMember.findOne({ user: userId, company: companyId });
  return member?.role === 'owner' || (await Company.findOne({ _id: companyId, owner: userId }));
};

// @desc  Get all team members
// @route GET /api/team
export const getTeamMembers = async (req, res, next) => {
  try {
    const members = await TeamMember.find({ company: req.user.company })
      .populate('user', 'name email phone')
      .populate('addedBy', 'name')
      .sort({ createdAt: 1 });
    res.json({ success: true, data: members });
  } catch (err) { next(err); }
};

// @desc  Add team member (admin creates account with temp password)
// @route POST /api/team
export const addTeamMember = async (req, res, next) => {
  try {
    const { name, email, phone, role, permissions, tempPassword } = req.body;

    // Only owner/admin can add members
    const adder = await TeamMember.findOne({ user: req.user.id, company: req.user.company });
    const company = await Company.findById(req.user.company);
    const isOwnerUser = company.owner?.toString() === req.user.id;
    const isAdmin = adder?.role === 'admin' || adder?.role === 'owner';
    if (!isOwnerUser && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Only owner or admin can add members' });
    }

    // Check if email already exists
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      // Check if already in this company
      const existing = await TeamMember.findOne({ user: user._id, company: req.user.company });
      if (existing) return res.status(400).json({ success: false, message: 'User already in your team' });
    } else {
      // Create new user account
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(tempPassword || 'Temp@1234', salt);
      user = await User.create({
        name, email: email.toLowerCase(), phone,
        password: hashedPassword,
        company: req.user.company,
        isVerified: true
      });
    }

    // Get default permissions for role
    const defaultPerms = TeamMember.defaultPermissions[role] || TeamMember.defaultPermissions.staff;
    const finalPermissions = permissions || defaultPerms;

    const member = await TeamMember.create({
      company: req.user.company,
      user: user._id,
      role: role || 'staff',
      permissions: finalPermissions,
      addedBy: req.user.id,
      tempPassword: tempPassword || 'Temp@1234',
      mustChangePassword: true
    });

    const populated = await TeamMember.findById(member._id)
      .populate('user', 'name email phone')
      .populate('addedBy', 'name');

    res.status(201).json({
      success: true,
      data: populated,
      message: `${name} added to team! Temp password: ${tempPassword || 'Temp@1234'}`
    });
  } catch (err) { next(err); }
};

// @desc  Update member role and permissions
// @route PUT /api/team/:id
export const updateTeamMember = async (req, res, next) => {
  try {
    const { role, permissions, status } = req.body;
    const company = await Company.findById(req.user.company);
    const isOwnerUser = company.owner?.toString() === req.user.id;

    if (!isOwnerUser) {
      // Admins can update but not owner's record
      const adder = await TeamMember.findOne({ user: req.user.id, company: req.user.company });
      if (!adder || !['owner', 'admin'].includes(adder.role)) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    const member = await TeamMember.findOne({ _id: req.params.id, company: req.user.company });
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

    // Can't change owner's role
    if (member.role === 'owner' && !isOwnerUser) {
      return res.status(403).json({ success: false, message: 'Cannot modify owner' });
    }

    if (role) member.role = role;
    if (permissions) member.permissions = { ...member.permissions.toObject(), ...permissions };
    if (status) member.status = status;
    await member.save();

    const updated = await TeamMember.findById(member._id).populate('user', 'name email phone');
    res.json({ success: true, data: updated, message: 'Member updated!' });
  } catch (err) { next(err); }
};

// @desc  Remove team member
// @route DELETE /api/team/:id
export const removeTeamMember = async (req, res, next) => {
  try {
    const member = await TeamMember.findOne({ _id: req.params.id, company: req.user.company });
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    if (member.role === 'owner') return res.status(403).json({ success: false, message: 'Cannot remove owner' });

    await member.deleteOne();
    res.json({ success: true, message: 'Member removed' });
  } catch (err) { next(err); }
};

// @desc  Get members who can receive SFP (have canSFP or canSendChallan)
// @route GET /api/team/sfp-recipients
export const getSFPRecipients = async (req, res, next) => {
  try {
    const members = await TeamMember.find({
      company: req.user.company,
      status: 'active',
      user: { $ne: req.user.id },
      $or: [
        { 'permissions.canSendChallan': true },
        { 'permissions.canSFP': true },
        { role: { $in: ['owner', 'admin', 'manager'] } }
      ]
    }).populate('user', 'name email');

    res.json({ success: true, data: members });
  } catch (err) { next(err); }
};

// @desc  SFP - Send challan internally for processing
// @route POST /api/team/sfp/:challanId
export const sendForProcessing = async (req, res, next) => {
  try {
    const { toUserId, note } = req.body;
    const Challan = (await import('../models/Challan.js')).default;

    const challan = await Challan.findOne({ _id: req.params.challanId, company: req.user.company });
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found' });

    // Check sender has SFP permission
    const senderMember = await TeamMember.findOne({ user: req.user.id, company: req.user.company });
    const company = await Company.findById(req.user.company);
    const isOwner = company.owner?.toString() === req.user.id;
    if (!isOwner && !senderMember?.permissions?.canSFP && !['owner','admin','manager'].includes(senderMember?.role)) {
      return res.status(403).json({ success: false, message: 'No permission for SFP' });
    }

    // Add to SFP trail
    challan.sfpTrail = challan.sfpTrail || [];
    challan.sfpTrail.push({
      action: 'sfp_sent',
      by: req.user.id,
      to: toUserId,
      note: note || '',
      at: new Date()
    });
    challan.sfpStatus = 'pending_sfp';
    challan.sfpAssignedTo = toUserId;
    await challan.save();

    // Notify recipient
    const toUser = await User.findById(toUserId);
    const fromUser = await User.findById(req.user.id);

    const { createNotification } = await import('../utils/notify.js');
    await createNotification({
      company: req.user.company,
      type: 'challan_received',
      title: `📋 Challan sent to you for processing`,
      message: `${fromUser?.name} sent Challan ${challan.challanNumber} to you for processing${note ? '. Note: ' + note : ''}`,
      link: '/challans',
      relatedChallan: challan._id,
      fromCompany: fromUser?.name
    });

    res.json({ success: true, message: `Challan sent to ${toUser?.name} for processing!` });
  } catch (err) { next(err); }
};

// @desc  Get my permissions
// @route GET /api/team/my-permissions
export const getMyPermissions = async (req, res, next) => {
  try {
    const company = await Company.findById(req.user.company);
    const isOwner = company.owner?.toString() === req.user.id;

    if (isOwner) {
      return res.json({ success: true, role: 'owner', permissions: TeamMember.defaultPermissions.owner });
    }

    const member = await TeamMember.findOne({ user: req.user.id, company: req.user.company });
    if (!member) {
      // Auto-create owner record if not exists
      return res.json({ success: true, role: 'owner', permissions: TeamMember.defaultPermissions.owner });
    }

    res.json({ success: true, role: member.role, permissions: member.permissions, status: member.status });
  } catch (err) { next(err); }
};

// @desc  Owner/Admin resets a member's password
// @route PUT /api/team/:id/reset-password
export const resetMemberPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ success: false, message: 'Password required' });

    const member = await TeamMember.findOne({ _id: req.params.id, company: req.user.company })
      .populate('user');
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    if (member.role === 'owner') return res.status(403).json({ success: false, message: 'Cannot change owner password here' });

    const bcrypt = await import('bcryptjs');
    const salt = await bcrypt.default.genSalt(10);
    const hashed = await bcrypt.default.hash(newPassword, salt);

    await User.findByIdAndUpdate(member.user._id, { password: hashed });

    // Store plain password in TeamMember so admin can see it
    member.tempPassword = newPassword;
    await member.save();

    res.json({ success: true, message: `Password updated for ${member.user.name}` });
  } catch (err) { next(err); }
};
