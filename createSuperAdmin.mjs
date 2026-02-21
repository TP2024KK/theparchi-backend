// Place in root of theparchi-backend
// Run: node createSuperAdmin.mjs

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ⚠️ PASTE YOUR MONGO_URI HERE:
const MONGO_URI = 'mongodb+srv://kundanchaudhary17_db_user:x7Enuv63A9fWlDoE@cluster0.bwdu68j.mongodb.net/theparchi?appName=Cluster0';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, default: null },
  role: { type: String, default: 'super_admin' },
  isSuperAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

await mongoose.connect(MONGO_URI);
console.log('Connected to MongoDB');

const email = 'admin@theparchi.com';
const password = 'TheParchi@Admin2026';

const exists = await User.findOne({ email });
if (exists) {
  console.log('Super admin already exists:', email);
  await mongoose.disconnect();
  process.exit(0);
}

const hashed = await bcrypt.hash(password, 10);
await User.create({ name: 'TheParchi Admin', email, password: hashed, role: 'super_admin', isSuperAdmin: true, company: null });

console.log('✅ Super admin created!');
console.log('Email:', email);
console.log('Password:', password);
await mongoose.disconnect();
