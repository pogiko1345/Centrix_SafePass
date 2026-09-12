const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: String,
  userName: String,
  actorRole: String,
  location: String,
  accessType: { type: String, enum: ['entry', 'exit', 'system'] },
  activityType: { type: String, default: '' },
  status: { type: String, enum: ['granted', 'denied', 'pending', 'no_show', 'expired', 'warning', 'flagged', 'cancelled'] },
  nfcCardId: String,
  relatedVisitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', default: null },
  relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
  notes: String
});

accessLogSchema.index({ timestamp: -1 });
accessLogSchema.index({ status: 1, timestamp: -1 });
accessLogSchema.index({ accessType: 1, timestamp: -1 });
accessLogSchema.index({ userId: 1, timestamp: -1 });
accessLogSchema.index({ relatedVisitor: 1, timestamp: -1 });
accessLogSchema.index({ relatedUser: 1, timestamp: -1 });
accessLogSchema.index({ activityType: 1, timestamp: -1 });
accessLogSchema.index({ userId: 1, "metadata.clientTapId": 1 });

module.exports = mongoose.model('AccessLog', accessLogSchema);
