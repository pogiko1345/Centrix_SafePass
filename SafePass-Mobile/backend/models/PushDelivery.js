const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  status: { type: String, enum: ['pending', 'ticketed', 'delivered', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: () => new Date(0) },
  ticketId: String,
  lastError: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});
schema.index({ notification: 1, token: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('PushDelivery', schema);
