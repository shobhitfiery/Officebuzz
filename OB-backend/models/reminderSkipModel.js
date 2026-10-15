// models/reminderSkipModel.js — automatic reminders an admin chose not to send.
const mongoose = require('mongoose');

const reminderSkipSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // same as the reminder's dedupe key
    skippedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.models.ReminderSkip || mongoose.model('ReminderSkip', reminderSkipSchema);
