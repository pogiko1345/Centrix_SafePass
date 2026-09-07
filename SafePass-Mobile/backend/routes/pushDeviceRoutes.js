const express = require('express');
const PushDevice = require('../models/PushDevice');
const isPushToken = token => typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token) && token.length <= 256;

module.exports = ({ authMiddleware }) => {
  const router = express.Router();
  router.put('/notifications/device', authMiddleware, async (req, res) => {
    const { token, platform } = req.body || {};
    if (!isPushToken(token) || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Invalid notification device.' });
    }
    try {
      await PushDevice.findOneAndUpdate({ token }, { $set: { user: req.user._id, platform, updatedAt: new Date() } }, { upsert: true, new: true, runValidators: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Unable to register notifications.' });
    }
  });
  router.delete('/notifications/device', authMiddleware, async (req, res) => {
    if (!isPushToken(req.body?.token)) return res.status(400).json({ success: false, message: 'Invalid notification device.' });
    try {
      await PushDevice.deleteOne({ token: req.body.token, user: req.user._id });
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Unable to unregister notifications.' });
    }
  });
  return router;
};
module.exports.isPushToken = isPushToken;
