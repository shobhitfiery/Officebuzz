// services/push.js — Web Push (VAPID) delivery to every subscribed browser.
const webpush = require('web-push');
const PushSubscription = require('../models/pushSubscriptionModel');

let ready = false;
const init = () => {
    if (ready) return true;
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    ready = true;
    return true;
};

const publicKey = () => process.env.VAPID_PUBLIC_KEY || null;

// Push to all devices of the given users. Dead subscriptions (410/404) are removed.
// Returns { sent, failed, errors }.
const sendToUsers = async (userIds, payload) => {
    if (!init()) return { sent: 0, failed: 0, errors: ['Push is not configured (VAPID keys missing)'] };
    const subs = await PushSubscription.find({ user: { $in: userIds } }).lean();
    const data = JSON.stringify(payload);
    const errors = [];
    let sent = 0;
    await Promise.all(
        subs.map(async (s) => {
            try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data, { TTL: 60 * 60 * 12 });
                sent += 1;
            } catch (e) {
                if (e.statusCode === 404 || e.statusCode === 410) {
                    await PushSubscription.deleteOne({ _id: s._id }); // browser unsubscribed / expired
                } else {
                    errors.push(`push: ${e.statusCode || ''} ${e.body || e.message}`.trim());
                }
            }
        })
    );
    return { sent, failed: errors.length, errors };
};

module.exports = { init, publicKey, sendToUsers };
