// models/PollVote.js
import mongoose from 'mongoose';

const PollVoteSchema = new mongoose.Schema({
  clientId: { type: String, index: true },
  chatId:   { type: String, index: true },           // e.g. "923090230074@c.us"
  pollMessageId: { type: String, index: true },      // messageId of the poll you sent
  correlationId: { type: String, index: true },      // e.g. "confirm:10000012"
  voter:    { type: String, index: true },           // e.g. "923090230074@c.us"
  option:   { type: String },                        // option text or id
  source:   { type: String, enum: ['tap','text'], default: 'tap' }, // how captured
  votedAt:  { type: Date, default: Date.now }
}, { timestamps: true });

// If you send single-select polls, this uniqueness is safe. For multi-select, allow duplicates.
PollVoteSchema.index({ clientId: 1, pollMessageId: 1, voter: 1 }, { unique: true });

export const PollVote = mongoose.model('PollVote', PollVoteSchema);
// PollVote schema

