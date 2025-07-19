const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipientType: {
    type: String,
    enum: ['cadet', 'admin', 'instructor'],
    required: true
  },
  type: {
    type: String,
    enum: ['alert', 'reminder', 'announcement', 'schedule', 'achievement', 'requirement'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: mongoose.Schema.Types.Mixed,
  read: { type: Boolean, default: false },
  readAt: Date,
  expiresAt: Date,
  actionRequired: { type: Boolean, default: false },
  actionCompleted: { type: Boolean, default: false },
  actionCompletedAt: Date
}, { timestamps: true });

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  type: {
    type: String,
    enum: ['general', 'event', 'training', 'emergency', 'policy'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  targetAudience: [{
    type: String,
    enum: ['all', 'cadets', 'staff', 'freshmen', 'sophomores', 'juniors', 'seniors']
  }],
  validFrom: { type: Date, default: Date.now },
  validUntil: Date,
  attachments: [{
    filename: String,
    url: String,
    type: String
  }],
  acknowledgementRequired: { type: Boolean, default: false },
  acknowledgements: [{
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderType: {
    type: String,
    enum: ['cadet', 'admin', 'instructor', 'system'],
    required: true
  },
  recipient: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipientType: {
    type: String,
    enum: ['cadet', 'admin', 'instructor'],
    required: true
  },
  subject: String,
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  readAt: Date,
  attachments: [{
    filename: String,
    url: String,
    type: String
  }],
  metadata: {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageThread' },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
  }
}, { timestamps: true });

const messageThreadSchema = new mongoose.Schema({
  subject: String,
  participants: [{
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    userType: {
      type: String,
      enum: ['cadet', 'admin', 'instructor'],
      required: true
    },
    lastRead: Date
  }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  messageCount: { type: Number, default: 0 }
}, { timestamps: true });

// Indexes
notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
announcementSchema.index({ validUntil: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ sender: 1, recipient: 1 });
messageSchema.index({ 'metadata.thread': 1 });

// Export models
module.exports = {
  Notification: mongoose.model('Notification', notificationSchema),
  Announcement: mongoose.model('Announcement', announcementSchema),
  Message: mongoose.model('Message', messageSchema),
  MessageThread: mongoose.model('MessageThread', messageThreadSchema)
};
