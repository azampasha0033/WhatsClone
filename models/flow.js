import mongoose from "mongoose";

const nodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  data: { type: Object, default: {} }
}, { _id: false });

const edgeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
  type: { type: String, default: "default" },
  data: { type: Object, default: {} }
}, { _id: false });

const flowSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },   // Here we link it to a specific client
    name: { type: String, required: true },
    status: { type: String, required: true, default: "draft" },
    nodes: [nodeSchema],
    edges: [edgeSchema]
  },
  { timestamps: true }
);

export const Flow = mongoose.model("Flow", flowSchema);
