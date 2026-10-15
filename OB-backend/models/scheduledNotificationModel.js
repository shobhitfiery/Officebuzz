// models/scheduledNotificationModel.js — announcements an admin has queued for later.
const mongoose = require('mongoose');
const { TYPES } = require('../services/emailTemplates');

const scheduledSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: TYPES, default: 'info' }, // category → email template
    sendAt: { type: Date, required: true, index: true },
    audience: { type: String, enum: ['all', 'selected'], default: 'all' },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // only for 'selected'
    channels: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
    },
    status: { type: String, enum: ['scheduled', 'sending', 'sent', 'failed'], default: 'scheduled', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null }, // once sent
    sentAt: { type: Date, default: null },
    error: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.models.ScheduledNotification || mongoose.model('ScheduledNotification', scheduledSchema);
