import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    // never return these by default
    passwordHash: { type: String, required: true, select: false },

    // Phone verification (WhatsApp)
    phoneRaw:   { type: String, required: true, trim: true },
    phoneE164:  { type: String, required: true, unique: true, index: true },
    phoneVerified: { type: Boolean, default: false },

    // Signup OTP (phone verification) — hidden by default
    otpHash:          { type: String, default: null, select: false },
    otpExpiresAt:     { type: Date,   default: null },
    otpAttemptCount:  { type: Number, default: 0, min: 0, max: 10 },

    // 🔹 Password-reset OTP — hidden by default
    resetOtpHash:         { type: String, default: null, select: false },
    resetOtpExpiresAt:    { type: Date,   default: null },
    resetOtpAttemptCount: { type: Number, default: 0, min: 0, max: 10 },

    // Tenant scoping / role
    clientId: { type: String, default: null, trim: true },
    role: { type: String, enum: ['owner', 'admin', 'user'], default: 'user' }
  },
  { timestamps: true }
);

// Helpful indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phoneE164: 1 }, { unique: true });

// Always normalize phone/email on set (extra safety)
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

// Clean JSON output
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
