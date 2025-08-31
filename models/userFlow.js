import mongoose from "mongoose";

const userFlowSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    userId: { type: String, required: true }, // msg.from
    flowId: { type: mongoose.Schema.Types.ObjectId, ref: "Flow", required: true },
    currentNodeId: { type: String, required: true },
  },
  { timestamps: true }
);

// Ensure a user can have only one state per flow
userFlowSchema.index({ clientId: 1, userId: 1, flowId: 1 }, { unique: true });

export const UserFlow = mongoose.model("UserFlow", userFlowSchema);
