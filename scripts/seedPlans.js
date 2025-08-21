// scripts/seedPlans.js
import 'dotenv/config';
import { connectDB } from '../db/mongo.js';
import { Plan } from '../models/Plan.js';

async function run() {
  await connectDB();

  const docs = [
    {
      code: 'BASIC_MONTHLY',
      name: 'Basic (Monthly)',
      months: 1,
      price: 10,
      currency: 'USD',
      messageLimit: 1000,                 // ← added
      features: ['Email support', 'Basic analytics'],
      isActive: true,
      sortOrder: 1
    },
    {
      code: 'PRO_MONTHLY',
      name: 'Pro (Monthly)',
      months: 1,
      price: 25,
      currency: 'USD',
      messageLimit: 10000,                // ← added
      features: ['Priority support', 'Advanced analytics'],
      isActive: true,
      sortOrder: 2
    },
    {
      code: 'PRO_YEARLY',
      name: 'Pro (Yearly)',
      months: 12,
      price: 250,
      currency: 'USD',
      messageLimit: 120000,               // ← added
      features: ['Priority support', 'Advanced analytics', 'Yearly discount'],
      isActive: true,
      sortOrder: 3
    }
  ];

  for (const d of docs) {
    await Plan.updateOne({ code: d.code }, { $set: d }, { upsert: true });
  }

  //console.log('✅ Plans seeded/updated');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
