// services/notifier.js — create a notification and deliver it by push + email.
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const Employee = require('../models/employeeModel');
const mailer = require('./mailer');
const push = require('./push');

// Every registered user except those linked to an inactive employee record.
const activeUserIds = async () => {
    const inactive = await Employee.find({ isActive: false, email: { $nin: [null, ''] } }).select('email').lean();
    const blocked = new Set(inactive.map((e) => e.email.toLowerCase()));
    const users = await User.find({}).select('_id email').lean();
    return users.filter((u) => !blocked.has(String(u.email).toLowerCase())).map((u) => u._id);
};

// Deliver an already-saved notification and record the outcome on it.
const deliver = async (notification) => {
    const users = await User.find({ _id: { $in: notification.recipients } }).select('email').lean();
    const message = { title: notification.title, body: notification.body, type: notification.type, link: notification.link };
    const errors = [];
    let email = { sent: 0, failed: 0, errors: [] };
    let pushRes = { sent: 0, failed: 0, errors: [] };

    try {
        if (notification.channels.email) email = await mailer.sendToMany(users.map((u) => u.email).filter(Boolean), message);
    } catch (e) {
        email = { sent: 0, failed: users.length, errors: [e.message] };
    }
    try {
        if (notification.channels.push) {
            pushRes = await push.sendToUsers(notification.recipients, {
                title: notification.title,
                body: notification.body.length > 240 ? `${notification.body.slice(0, 237)}…` : notification.body,
                url: notification.link || '/notifications',
                tag: String(notification._id),
            });
        }
    } catch (e) {
        pushRes = { sent: 0, failed: 1, errors: [e.message] };
    }

    errors.push(...email.errors, ...pushRes.errors);
    notification.delivery = {
        status: email.sent + pushRes.sent > 0 || (!email.failed && !pushRes.failed) ? 'sent' : 'failed',
        emailSent: email.sent,
        emailFailed: email.failed,
        pushSent: pushRes.sent,
        pushFailed: pushRes.failed,
        errors: errors.slice(0, 50),
        finishedAt: new Date(),
    };
    await notification.save();
    if (errors.length) console.warn(`Notification "${notification.title}": ${errors.length} delivery problem(s)`, errors.slice(0, 3));
    return notification;
};

/**
 * Create + deliver. `recipients` = array of user ids, or 'all'.
 * Returns the saved notification immediately; delivery continues in the background
 * unless `wait` is true. Returns null if `dedupeKey` was already used.
 */
const notify = async ({ title, body, type = 'info', link = '/notifications', recipients = 'all', createdBy = null, dedupeKey, channels = { email: true, push: true }, wait = false }) => {
    const ids = recipients === 'all' ? await activeUserIds() : recipients;
    let notification;
    try {
        notification = await Notification.create({
            title, body, type, link, createdBy, dedupeKey, channels,
            audience: recipients === 'all' ? 'all' : 'selected',
            recipients: ids,
        });
    } catch (e) {
        if (e.code === 11000) return null; // already sent (dedupe)
        throw e;
    }
    const job = deliver(notification).catch((e) => console.error('Notification delivery failed', e));
    if (wait) await job;
    return notification;
};

module.exports = { notify, deliver, activeUserIds };
