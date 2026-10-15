// services/scheduledSender.js — sends admin-scheduled announcements when they're due (checked every minute).
const ScheduledNotification = require('../models/scheduledNotificationModel');
const { notify } = require('./notifier');

const CHECK_EVERY_MS = 60 * 1000;

// Send one scheduled item now. Claims it atomically so two runs can never double-send.
const sendScheduled = async (id) => {
    const item = await ScheduledNotification.findOneAndUpdate(
        { _id: id, status: 'scheduled' },
        { $set: { status: 'sending' } },
        { new: true }
    );
    if (!item) return null;
    try {
        const n = await notify({
            title: item.title,
            body: item.body,
            type: item.type || 'info',
            recipients: item.audience === 'all' ? 'all' : item.recipients,
            createdBy: item.createdBy,
            channels: item.channels,
            dedupeKey: `scheduled:${item._id}`,
        });
        item.status = 'sent';
        item.sentAt = new Date();
        item.notification = n ? n._id : null;
        item.error = null;
    } catch (e) {
        item.status = 'failed';
        item.error = e.message;
    }
    await item.save();
    return item;
};

const sendDue = async () => {
    const due = await ScheduledNotification.find({ status: 'scheduled', sendAt: { $lte: new Date() } }).select('_id').lean();
    for (const d of due) await sendScheduled(d._id);
    return due.length;
};

let timer = null;
const start = () => {
    if (timer) return;
    const tick = () => sendDue().catch((e) => console.error('Scheduled notifications failed (will retry):', e.message));
    setTimeout(tick, 10 * 1000);
    timer = setInterval(tick, CHECK_EVERY_MS);
};

module.exports = { start, sendDue, sendScheduled };
