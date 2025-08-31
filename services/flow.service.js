import { Flow } from "../models/flow.js";

async function toggleActive(clientId, flowId) {
  const flow = await Flow.findOne({ _id: flowId, clientId });
  if (!flow) return null;

  // flip between "draft" and "active"
  flow.status = flow.status === "active" ? "draft" : "active";
  await flow.save();
  return flow;
}

export const flowService = {
  // Create a flow for a specific client
  async createFlow(clientId, name, nodes = [], edges = []) {
    const flow = new Flow({ clientId, name, nodes, edges });
    return await flow.save();
  },

  // Get all flows for a specific client
  async getFlows(clientId) {
    return await Flow.find({ clientId });
  },

  // Get a specific flow by clientId and flowId
  async getFlowById(clientId, flowId) {
    return await Flow.findOne({ _id: flowId, clientId });
  },

  // Update flow for a specific client
  async updateFlow(clientId, flowId, data) {
    return await Flow.findOneAndUpdate({ _id: flowId, clientId }, data, { new: true });
  },

  // Delete flow for a specific client
  async deleteFlow(clientId, flowId) {
    return await Flow.findOneAndDelete({ _id: flowId, clientId });
  },

  // Update only nodes in a flow
  async updateNodes(clientId, flowId, nodes) {
    return await Flow.findOneAndUpdate(
      { _id: flowId, clientId },
      { $set: { nodes } },
      { new: true }
    );
  },

  // Update only edges in a flow
  async updateEdges(clientId, flowId, edges) {
    return await Flow.findOneAndUpdate(
      { _id: flowId, clientId },
      { $set: { edges } },
      { new: true }
    );
  }, // ✅ Toggle active/draft status
  async toggleActive(clientId, flowId) {
    const flow = await Flow.findOne({ _id: flowId, clientId });
    if (!flow) return null;

    flow.status = flow.status === "active" ? "draft" : "active";
    await flow.save();
    return flow;
  }
};
