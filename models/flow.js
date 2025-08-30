import mongoose from "mongoose";

const nodeSchema = new mongoose.Schema({
  id: { type: String, required: true },        // React Flow node id
  type: { type: String, required: true },      // e.g., "input", "output", "customNode"
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  data: { type: Object, default: {} }          // Node-specific data (labels, metadata, templateId, etc.)
}, { _id: false });

const edgeSchema = new mongoose.Schema({
  id: { type: String, required: true },        // React Flow edge id
  source: { type: String, required: true },
  target: { type: String, required: true },
  type: { type: String, default: "default" },
  data: { type: Object, default: {} }
}, { _id: false });

const flowSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },    // link to WA client
    name: { type: String, required: true },
    nodes: [nodeSchema],
    edges: [edgeSchema]
  },
  { timestamps: true }
);

export const Flow = mongoose.model("Flow", flowSchema);
