import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,     // unique already implies index
      lowercase: true,
      trim: true
    },

    passwordHash: { type: String, required: true, select: false },

    phoneRaw:   { type: String, required: true, trim: true },
    phoneE164:  { type: String, required: true, unique: true }, // unique implies index
    phoneVerified: { type: Boolean, default: false },

    otpHash:          { type: String, default: null, select: false },
    otpExpiresAt:     { type: Date,   default: null },
    otpAttemptCount:  { type: Number, default: 0, min: 0, max: 10 },

    resetOtpHash:         { type: String, default: null, select: false },
    resetOtpExpiresAt:    { type: Date,   default: null },
    resetOtpAttemptCount: { type: Number, default: 0, min: 0, max: 10 },

    clientId: { type: String, default: null, trim: true },
    role: { type: String, enum: ['owner', 'admin', 'user'], default: 'user' }
  },
  { timestamps: true }
);

// ❌ Remove duplicate manual indexes
// userSchema.index({ email: 1 }, { unique: true });
// userSchema.index({ phoneE164: 1 }, { unique: true });

userSchema.pre('save', function (next) {
  if (this.isModified('email') && this.email) {
    this.email = String(this.email).trim().toLowerCase();
  }
  if (this.isModified('phoneRaw') && this.phoneRaw) {
    this.phoneRaw = String(this.phoneRaw).trim();
  }
  if (this.isModified('clientId') && this.clientId) {
    this.clientId = String(this.clientId).trim();
  }
  next();
});

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.otpHash;
    delete ret.resetOtpHash;
    delete ret.__v;
    return ret;
  }
});

export const UserModel = mongoose.model('User', userSchema);
