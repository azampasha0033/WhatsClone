import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    phoneRaw: { type: String, trim: true },
    phoneE164: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    permissions: {
      create: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
  },
  { timestamps: true }
);

// Unique per client (owner)
agentSchema.index({ clientId: 1, email: 1 }, { unique: true });
agentSchema.index({ clientId: 1, phoneE164: 1 }, { unique: true });

agentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

export const AgentModel = mongoose.model('Agent', agentSchema);
