import { Flow } from "../models/flow.js";

export const flowService = {
  async createFlow(clientId, name, nodes = [], edges = []) {
    const flow = new Flow({ clientId, name, nodes, edges });
    return await flow.save();
  },

  async getFlows(clientId) {
    return await Flow.find({ clientId });
  },

  async getFlowById(clientId, flowId) {
    return await Flow.findOne({ _id: flowId, clientId });
  },

  async updateFlow(clientId, flowId, data) {
    return await Flow.findOneAndUpdate({ _id: flowId, clientId }, data, { new: true });
  },

  async deleteFlow(clientId, flowId) {
    return await Flow.findOneAndDelete({ _id: flowId, clientId });
  },

  // 🔹 For updating nodes only
  async updateNodes(clientId, flowId, nodes) {
    return await Flow.findOneAndUpdate(
      { _id: flowId, clientId },
      { $set: { nodes } },
      { new: true }
    );
  },

  // 🔹 For updating edges only
  async updateEdges(clientId, flowId, edges) {
    return await Flow.findOneAndUpdate(
      { _id: flowId, clientId },
      { $set: { edges } },
      { new: true }
    );
  }
};
