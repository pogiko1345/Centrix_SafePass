const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['visitor', 'alert', 'info', 'success', 'warning'],
    default: 'info'
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  
  // For targeting specific users/roles
  targetRole: { 
    type: String, 
    enum: ['security', 'guard', 'staff', 'admin', 'visitor', 'student', 'teacher', 'all'],
    default: 'all'
  },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Specific user
  
  // Read status
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  
  // Reference to related data
  relatedVisitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor' },
  relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  pushQueued: { type: Boolean, default: false, select: false },
  expiresAt: Date // Auto-delete after this date
});

notificationSchema.index({ targetRole: 1, createdAt: -1 });
notificationSchema.index({ pushQueued: 1, createdAt: 1 });
notificationSchema.index({ targetUser: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
