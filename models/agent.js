import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',  // Link to the User model (client)
      required: true,  // Make sure clientId is required
      index: true,
    },
    name: { type: String, trim: true },
    email: {
      type: String,
      required: true,  // Ensure email is required
      lowercase: true,
      trim: true,
    },
    phoneRaw: { type: String, trim: true },
    phoneE164: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    permissions: {
      create: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// Ensure uniqueness *per owner* (same email/phone can exist under different owners)
agentSchema.index({ clientId: 1, email: 1 }, { unique: true });
agentSchema.index({ clientId: 1, phoneE164: 1 }, { unique: true });

export const AgentModel = mongoose.model('Agent', agentSchema);
