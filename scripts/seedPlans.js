// scripts/seedPlans.js
import 'dotenv/config';
import { connectDB } from '../db/mongo.js';
import { Plan } from '../models/Plan.js';

async function run() {
  await connectDB();

  const docs = [
    {
      code: 'FREE_MONTHLY',
      name: 'FREE (Monthly)',
      months: 1,
      price: 0,
      currency: 'USD',
      messageLimit: 60,
      features: [
        'Inbox (multi-chat + advanced filters)',
        'Campaigns (bulk sends)',
        'Templates',
        'Automation',
        'Analytics (message stats, response time)',
        'Contacts management',
        'Agent seats',
        'Labels',
        'API Keys access',
      ],
      isActive: true,
      sortOrder: 0,
      status: 'public'
    },
    {
      code: 'BASIC_MONTHLY',
      name: 'Basic (Monthly)',
      months: 1,
      price: 11,
      currency: 'USD',
      messageLimit: 1000,
      features: [
        'Inbox (basic chat handling)',
        'Contacts management',
        'Labels'
      ],
      isActive: true,
      sortOrder: 1,
      status: 'public'
    },
    {
      code: 'PRO_MONTHLY',
      name: 'Pro (Monthly)',
      months: 1,
      price: 25,
      currency: 'USD',
      messageLimit: 10000,
      features: [
        'Inbox (multi-chat + advanced filters)',
        'Campaigns (bulk sends)',
        'Templates (unlimited)',
        'Automation (advanced flows + triggers)',
        'Analytics (message stats, response time)',
        'Contacts management',
        'Up to 5 Agent seats',
        'Labels',
        'API Keys access'
      ],
      isActive: true,
      sortOrder: 2,
      status: 'public'
    },
    {
      code: 'PRO_YEARLY',
      name: 'Pro (Yearly)',
      months: 12,
      price: 250,
      currency: 'USD',
      messageLimit: 120000,
      features: [
        'Inbox (multi-chat + advanced filters)',
        'Campaigns (bulk sends)',
        'Templates (unlimited)',
        'Automation (advanced flows + triggers)',
        'Analytics (message stats, response time)',
        'Contacts management',
        'Up to 5 Agent seats',
        'Labels',
        'API Keys access',
        'Yearly discount'
      ],
      isActive: true,
      sortOrder: 3,
      status: 'public'
    },
    {
      code: 'ENTERPRISE_PRIVATE',
      name: 'Enterprise (Private)',
      months: 12,
      price: 1000,
      currency: 'USD',
      messageLimit: 1000000,
      features: [
        'Inbox (unlimited chats + routing)',
        'Campaigns (advanced segmentation)',
        'Templates (unlimited + custom approvals)',
        'Automation (AI-powered workflows)',
        'Analytics (custom dashboards, exports)',
        'Contacts management ',
        'Unlimited Agent seats',
        'Labels',
        'Subscription management',
        'API Keys + Webhooks',
        'Dedicated account manager'
      ],
      isActive: true,
      sortOrder: 99999,
      status: 'private' // hidden from normal users
    }
  ];

  for (const d of docs) {
    await Plan.updateOne({ code: d.code }, { $set: d }, { upsert: true });
  }

  console.log('✅ Plans seeded/updated');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
