import { UserFlow } from "../models/userFlow.js";

export const userFlowService = {
  // Get user flow state
  async getUserState(clientId, userId, flowId) {
    return await UserFlow.findOne({ clientId, userId, flowId });
  },

  // Create new user flow state
  async createUserState(clientId, userId, flowId, currentNodeId) {
    const userFlow = new UserFlow({ clientId, userId, flowId, currentNodeId });
    return await userFlow.save();
  },

  // Update user flow state
  async updateUserState(userFlowId, currentNodeId) {
    return await UserFlow.findByIdAndUpdate(
      userFlowId,
      { currentNodeId },
      { new: true }
    );
  },

  // Reset or delete user flow
  async deleteUserState(clientId, userId, flowId) {
    return await UserFlow.findOneAndDelete({ clientId, userId, flowId });
  }
};
