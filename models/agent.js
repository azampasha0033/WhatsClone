import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema(
  {
    // Link every agent to the owning User (_id of your UserModel)
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Identity
    name: { type: String, trim: true, default: '' },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phoneRaw:  { type: String, trim: true, default: '' },
    phoneE164: { type: String, trim: true, default: '' },

    // Auth (never store plain text)
    passwordHash: { type: String, required: true, select: false },

    // Permissions for this agent (scoped to the owner/clientId)
    permissions: {
      create: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
    },

    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    notes:  { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// Ensure uniqueness *per owner* (same email/phone can exist under different owners)
agentSchema.index({ clientId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
agentSchema.index({ clientId: 1, phoneE164: 1 }, { unique: true, partialFilterExpression: { phoneE164: { $type: 'string' } } });

agentSchema.pre('save', function(next) {
  if (this.isModified('email') && this.email) this.email = String(this.email).trim().toLowerCase();
  if (this.isModified('phoneRaw') && this.phoneRaw) this.phoneRaw = String(this.phoneRaw).trim();
  if (this.isModified('phoneE164') && this.phoneE164) this.phoneE164 = String(this.phoneE164).trim();
  next();
});

agentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

export const AgentModel = mongoose.model('Agent', agentSchema);
