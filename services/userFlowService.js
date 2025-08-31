import { UserFlow } from "../models/userFlow.js";

export const userFlowService = {
  async getUserState(clientId, userId, flowId) {
    return await UserFlow.findOne({ clientId, userId, flowId });
  },

  async createUserState(clientId, userId, flowId, startNodeId) {
    return await UserFlow.create({
      clientId,
      userId,
      flowId,
      currentNodeId: startNodeId,
    });
  },

  async updateUserState(userFlowId, newNodeId) {
    return await UserFlow.findByIdAndUpdate(
      userFlowId,
      { currentNodeId: newNodeId },
      { new: true }
    );
  },

  async deleteUserState(clientId, userId, flowId) {
    return await UserFlow.findOneAndDelete({ clientId, userId, flowId });
  },
};
