// Run from theparchi-backend folder:
// node addPartyCode_migration.mjs

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) { console.error('❌ No MONGODB_URI in .env'); process.exit(1); }

await mongoose.connect(uri);
console.log('✅ Connected to MongoDB');

const Party = mongoose.model('Party', new mongoose.Schema({}, { strict: false }));

const parties = await Party.find({ partyCode: { $exists: false } }).sort({ createdAt: 1 });
console.log(`Found ${parties.length} parties without a code`);

const companyCounters = {};

for (const party of parties) {
  const compId = party.company.toString();
  if (!companyCounters[compId]) {
    // Find highest existing code for this company
    const last = await Party.findOne({
      company: party.company,
      partyCode: { $exists: true, $ne: null }
    }).sort({ partyCode: -1 }).select('partyCode');
    if (last?.partyCode) {
      const match = last.partyCode.match(/\d+$/);
      companyCounters[compId] = match ? parseInt(match[0]) + 1 : 1;
    } else {
      companyCounters[compId] = 1;
    }
  }
  const code = `P${String(companyCounters[compId]).padStart(3, '0')}`;
  companyCounters[compId]++;
  await Party.updateOne({ _id: party._id }, { $set: { partyCode: code } });
  console.log(`  ${party.name} → ${code}`);
}

console.log('✅ Migration complete');
await mongoose.disconnect();
