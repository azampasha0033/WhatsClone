import mongoose from "mongoose";

const templateSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true }, // link to client
    name: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
  },
  { timestamps: true }
);

templateSchema.index({ clientId: 1, name: 1 }, { unique: true }); // unique per client

export const Template = mongoose.model("Template", templateSchema);
