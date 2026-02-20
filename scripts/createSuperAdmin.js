// Run this once: node scripts/createSuperAdmin.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from '../models/User.js';

const createSuperAdmin = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const email = 'admin@theparchi.com';
  const password = 'TheParchi@Admin2026';
  const name = 'TheParchi Admin';

  const exists = await User.findOne({ email });
  if (exists) {
    console.log('Super admin already exists:', email);
    await mongoose.disconnect();
    return;
  }

  await User.create({
    name, email, password,
    role: 'super_admin',
    isSuperAdmin: true,
    company: null
  });

  console.log('✅ Super admin created!');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('⚠️  Change password after first login!');
  await mongoose.disconnect();
};

createSuperAdmin().catch(console.error);
