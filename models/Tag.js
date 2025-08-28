import mongoose from "mongoose";

const tagSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true }, // link to client
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

tagSchema.index({ clientId: 1, name: 1 }, { unique: true }); // prevent duplicates per client

export const Tag = mongoose.model("Tag", tagSchema);
