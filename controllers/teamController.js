import User from '../models/User.js';

/**
 * @desc    Get all team members
 * @route   GET /api/team
 * @access  Private
 */
export const getTeamMembers = async (req, res, next) => {
  try {
    const { role, isActive } = req.query;

    const query = { company: req.user.company };

    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const teamMembers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: teamMembers
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Invite/Add new team member
 * @route   POST /api/team
 * @access  Private (Owner/Admin only)
 */
export const addTeamMember = async (req, res, next) => {
  try {
    const { name, email, role, phone, permissions } = req.body;

    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);

    // Create user
    const user = await User.create({
      name,
      email,
      password: tempPassword,
      phone,
      company: req.user.company,
      role: role || 'staff',
      permissions: permissions || [],
      isActive: true
    });

    // TODO: Send welcome email with temp password
    // For now, we'll return it in the response (change this in production)

    res.status(201).json({
      success: true,
      message: 'Team member added successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tempPassword // Remove this in production, send via email
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update team member
 * @route   PUT /api/team/:id
 * @access  Private (Owner/Admin only)
 */
export const updateTeamMember = async (req, res, next) => {
  try {
    const { role, permissions, isActive } = req.body;

    // Don't allow updating yourself
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot update your own account from team management'
      });
    }

    const user = await User.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Don't allow changing owner role
    if (user.role === 'owner') {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify owner account'
      });
    }

    if (role) user.role = role;
    if (permissions) user.permissions = permissions;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Team member updated successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        isActive: user.isActive
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove team member
 * @route   DELETE /api/team/:id
 * @access  Private (Owner only)
 */
export const removeTeamMember = async (req, res, next) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Don't allow deleting owner
    if (user.role === 'owner') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete owner account'
      });
    }

    // Don't allow deleting yourself
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    // Soft delete - just deactivate
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Team member removed successfully'
    });
  } catch (error) {
    next(error);
  }
};
