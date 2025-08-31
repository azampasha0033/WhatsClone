import mongoose from "mongoose";

const userFlowSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    userId: { type: String, required: true }, // WhatsApp user ID
    flowId: { type: mongoose.Schema.Types.ObjectId, ref: "Flow", required: true },
    currentNodeId: { type: String, required: true }, // current node in the flow
  },
  { timestamps: true }
);

userFlowSchema.index({ clientId: 1, userId: 1, flowId: 1 }, { unique: true });

export const UserFlow = mongoose.model("UserFlow", userFlowSchema);
