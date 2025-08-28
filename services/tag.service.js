import { Tag } from "../models/Tag.js";

export const tagService = {
  async createTag(clientId, name) {
    const tag = new Tag({ clientId, name });
    return await tag.save();
  },

  async getTags(clientId) {
    return await Tag.find({ clientId });
  },

  async updateTag(clientId, tagId, data) {
    return await Tag.findOneAndUpdate({ _id: tagId, clientId }, data, { new: true });
  },

  async deleteTag(clientId, tagId) {
    return await Tag.findOneAndDelete({ _id: tagId, clientId });
  }
};
