import { Template } from "../models/Template.js";

export const templateService = {
  async createTemplate(clientId, name, body) {
    const template = new Template({ clientId, name, body });
    return await template.save();
  },

  async getTemplates(clientId) {
    return await Template.find({ clientId }).populate("tags");
  },

  async updateTemplate(clientId, templateId, data) {
    return await Template.findOneAndUpdate({ _id: templateId, clientId }, data, { new: true });
  },

  async deleteTemplate(clientId, templateId) {
    return await Template.findOneAndDelete({ _id: templateId, clientId });
  },

  async assignTag(clientId, templateId, tagId) {
    const template = await Template.findOne({ _id: templateId, clientId });
    if (!template) throw new Error("Template not found");

    if (!template.tags.includes(tagId)) {
      template.tags.push(tagId);
      await template.save();
    }
    return await template.populate("tags");
  },

  async removeTag(clientId, templateId, tagId) {
    await Template.findOneAndUpdate(
      { _id: templateId, clientId },
      { $pull: { tags: tagId } }
    );
    return await Template.findById(templateId).populate("tags");
  }
};
