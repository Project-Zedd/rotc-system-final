const express = require('express');
const router = express.Router();
const { Notification, Announcement, Message, MessageThread } = require('../models/communication');
const { roleCheck } = require('../middleware/roleCheck');
const { validateObjectId } = require('../middleware/validation');
const { sendEmail, sendSMS } = require('../services/notificationService');

// Notification Routes
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
      recipientType: req.user.userType,
      expiresAt: { $gt: new Date() }
    })
    .sort('-createdAt')
    .limit(50);
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/notifications/mark-read', async (req, res) => {
  try {
    const { notificationIds } = req.body;
    await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        recipient: req.user.id
      },
      {
        $set: {
          read: true,
          readAt: new Date()
        }
      }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Announcement Routes
router.post('/announcements', roleCheck(['admin']), async (req, res) => {
  try {
    const announcement = new Announcement({
      ...req.body,
      author: req.user.id
    });
    await announcement.save();
    
    // Create notifications for target audience
    const targetUsers = await getUsersByAudience(req.body.targetAudience);
    const notifications = targetUsers.map(user => ({
      recipient: user._id,
      recipientType: user.userType,
      type: 'announcement',
      priority: req.body.priority,
      title: req.body.title,
      message: req.body.content,
      data: { announcementId: announcement._id },
      actionRequired: req.body.acknowledgementRequired,
      expiresAt: req.body.validUntil
    }));
    
    await Notification.insertMany(notifications);
    
    if (req.body.priority === 'urgent') {
      // Send immediate notifications via email/SMS
      for (const user of targetUsers) {
        if (user.email) {
          await sendEmail({
            to: user.email,
            subject: `URGENT: ${req.body.title}`,
            text: req.body.content
          });
        }
        if (user.phone) {
          await sendSMS({
            to: user.phone,
            message: `URGENT ROTC: ${req.body.title}`
          });
        }
      }
    }
    
    res.status(201).json(announcement);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/announcements/:id/acknowledge', validateObjectId('id'), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    
    if (!announcement.acknowledgements.some(ack => ack.user.equals(req.user.id))) {
      announcement.acknowledgements.push({
        user: req.user.id,
        timestamp: new Date()
      });
      await announcement.save();
      
      // Update related notification
      await Notification.updateOne(
        {
          recipient: req.user.id,
          'data.announcementId': announcement._id
        },
        {
          $set: {
            actionRequired: false,
            actionCompleted: true,
            actionCompletedAt: new Date()
          }
        }
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Messaging Routes
router.post('/messages', async (req, res) => {
  try {
    let thread = req.body.threadId ? 
      await MessageThread.findById(req.body.threadId) :
      new MessageThread({
        subject: req.body.subject,
        participants: [
          {
            user: req.user.id,
            userType: req.user.userType,
            lastRead: new Date()
          },
          {
            user: req.body.recipient,
            userType: req.body.recipientType,
          }
        ]
      });
    
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    
    const message = new Message({
      sender: req.user.id,
      senderType: req.user.userType,
      recipient: req.body.recipient,
      recipientType: req.body.recipientType,
      subject: req.body.subject,
      content: req.body.content,
      attachments: req.body.attachments,
      metadata: {
        thread: thread._id,
        replyTo: req.body.replyTo
      }
    });
    
    await message.save();
    
    thread.lastMessage = message._id;
    thread.messageCount += 1;
    await thread.save();
    
    // Create notification for recipient
    const notification = new Notification({
      recipient: req.body.recipient,
      recipientType: req.body.recipientType,
      type: 'message',
      priority: 'medium',
      title: `New message from ${req.user.name}`,
      message: req.body.content.substring(0, 100) + '...',
      data: {
        messageId: message._id,
        threadId: thread._id
      }
    });
    await notification.save();
    
    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/messages/threads', async (req, res) => {
  try {
    const threads = await MessageThread.find({
      'participants.user': req.user.id
    })
    .populate('lastMessage')
    .populate('participants.user', 'name')
    .sort('-updatedAt');
    
    res.json(threads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/messages/thread/:threadId', validateObjectId('threadId'), async (req, res) => {
  try {
    const thread = await MessageThread.findOne({
      _id: req.params.threadId,
      'participants.user': req.user.id
    });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    
    const messages = await Message.find({
      'metadata.thread': thread._id
    })
    .populate('sender', 'name')
    .sort('createdAt');
    
    // Update last read
    const participantIndex = thread.participants.findIndex(
      p => p.user.equals(req.user.id)
    );
    thread.participants[participantIndex].lastRead = new Date();
    await thread.save();
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get users by audience type
async function getUsersByAudience(audiences) {
  // Implementation depends on your user models
  // This is just a placeholder
  return [];
}

module.exports = router;
