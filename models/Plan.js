// models/Plan.js
import mongoose from 'mongoose';

const PlanSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true }, // e.g. 'BASIC_MONTHLY'
    name: { type: String, required: true },                             // e.g. 'Basic (Monthly)'
    months: { type: Number, required: true, min: 1 },                   // duration in months
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },

    // Optional, useful for UI:
    features: [{ type: String }],
    messageLimit: { type: Number },   // optional usage limits
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 } // for ordering in UI
  },
  { timestamps: true }
);

export const Plan =
  mongoose.models.Plan || mongoose.model('Plan', PlanSchema);
