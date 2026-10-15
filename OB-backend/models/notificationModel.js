// models/notificationModel.js
const mongoose = require('mongoose');
const { TYPES } = require('../services/emailTemplates');

const notificationSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    type: {
        type: String,
        enum: TYPES, // category → email template (services/emailTemplates.js)
        default: 'info',
    },
    link: { type: String, default: '/notifications' },  // where clicking it takes you
    audience: { type: String, enum: ['all', 'selected'], default: 'all' },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = automatic
    // Prevents the daily job from sending the same reminder twice (e.g. after a restart).
    dedupeKey: { type: String, default: undefined },
    channels: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
    },
    delivery: {
        status: { type: String, enum: ['sending', 'sent', 'failed'], default: 'sending' },
        emailSent: { type: Number, default: 0 },
        emailFailed: { type: Number, default: 0 },
        pushSent: { type: Number, default: 0 },
        pushFailed: { type: Number, default: 0 },
        errors: [{ type: String }],
        finishedAt: { type: Date, default: null },
    },
}, { timestamps: true });

notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ recipients: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
