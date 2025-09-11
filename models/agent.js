import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',  // Linking agent to User (client)
      required: true,
      index: true,
    },
    name: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phoneRaw: { type: String, trim: true },
    phoneE164: { type: String, trim: true },
    passwordHash: { type: String, required: true },  // Ensure it's stored but not selected by default
    permissions: {
      create: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      inbox: { type: Boolean, default: false },
      chats: { type: Boolean, default: false },
      message: { type: Boolean, default: false },
      campaign : { type: Boolean, default: false },
      createcampaign : { type: Boolean, default: false },
      templates: { type: Boolean, default: false },
      createtemplates: { type: Boolean, default: false },
      updatetemplates: { type: Boolean, default: false },
      deletetemplates: { type: Boolean, default: false },
      automation: { type: Boolean, default: false },
      flowlist: { type: Boolean, default: false },
      createflow: { type: Boolean, default: false },
      updateflow: { type: Boolean, default: false },
      analytics: { type: Boolean, default: false },
      contacts: { type: Boolean, default: false },
      agents: { type: Boolean, default: false },
      addagents: { type: Boolean, default: false },
      updateagents: { type: Boolean, default: false },
      deleteagents: { type: Boolean, default: false },
      labels: { type: Boolean, default: false },
      addlabels: { type: Boolean, default: false },
      updatelabels: { type: Boolean, default: false },
      deletelabels: { type: Boolean, default: false },
      subscription: { type: Boolean, default: false },
      APIKEY: { type: Boolean, default: false },
    },
    status: { type: String, enum: ['active', 'inactive','deleted'], default: 'active' },
     // 👤 Online presence
 online: { type: Boolean, default: false },
lastSeenAt: { type: Date, default: null },


  },
  { timestamps: true }
);

// Ensure uniqueness *per owner* (same email/phone can exist under different owners)
agentSchema.index({ clientId: 1, email: 1 }, { unique: true });

export const AgentModel = mongoose.model('Agent', agentSchema);

