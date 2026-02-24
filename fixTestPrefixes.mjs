// Run from theparchi-backend folder:
// node fixTestPrefixes.mjs

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) { console.error('❌ No MONGODB_URI in .env'); process.exit(1); }

await mongoose.connect(uri);
console.log('✅ Connected to MongoDB');

const Company = mongoose.model('Company', new mongoose.Schema({}, { strict: false }));

// Fix all companies EXCEPT the genuine user
const testCompanies = await Company.find({
  email: { $ne: 'eightleafdesigns@gmail.com' }
});

console.log(`Found ${testCompanies.length} test companies to fix`);

for (const company of testCompanies) {
  // Generate unique prefix from company _id last 5 chars
  const idSuffix = company._id.toString().slice(-5).toUpperCase();
  const newPrefix = `T${idSuffix}`;
  const newReturnPrefix = `T${idSuffix}R`;

  await Company.updateOne(
    { _id: company._id },
    {
      $set: {
        'settings.challanPrefix': newPrefix,
        'settings.returnChallanPrefix': newReturnPrefix,
      }
    }
  );
  console.log(`  ✅ ${company.name} (${company.email}) → prefix: ${newPrefix}, return: ${newReturnPrefix}`);
}

// Also drop old global unique indexes and let Mongoose recreate compound ones
console.log('\nDropping old global unique indexes...');
const db = mongoose.connection.db;

try {
  await db.collection('challans').dropIndex('challanNumber_1');
  console.log('✅ Dropped challans.challanNumber_1 index');
} catch (e) {
  console.log('ℹ️  challans index already dropped or not found:', e.message);
}

try {
  await db.collection('returnchallans').dropIndex('returnChallanNumber_1');
  console.log('✅ Dropped returnchallans.returnChallanNumber_1 index');
} catch (e) {
  console.log('ℹ️  returnchallans index already dropped or not found:', e.message);
}

console.log('\n✅ All done! Now redeploy backend to create new compound indexes.');
await mongoose.disconnect();
