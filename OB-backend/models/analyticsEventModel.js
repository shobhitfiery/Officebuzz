// models/analyticsEventModel.js — one row per page view or tracked action.
const mongoose = require('mongoose');

// How long the activity log is kept (default 30 days; ANALYTICS_RETENTION_DAYS in .env, 7–365).
const RETENTION_DAYS = Math.min(Math.max(Number(process.env.ANALYTICS_RETENTION_DAYS) || 30, 7), 365);

const analyticsEventSchema = new mongoose.Schema({
    kind: { type: String, enum: ['pageview', 'action'], required: true },
    name: { type: String, required: true, maxlength: 80 },     // 'pageview' or an action name, e.g. 'login'
    path: { type: String, default: '', maxlength: 300 },       // page route (normalised) or API route
    title: { type: String, default: '', maxlength: 150 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    sessionId: { type: String, default: '', maxlength: 64, index: true },
    vid: { type: String, default: undefined, maxlength: 40 },     // client id of a page view, so its time can be updated
    duration: { type: Number, default: 0 },                    // ms spent on the page (page views)
    source: { type: String, enum: ['web', 'server'], default: 'web' },
    device: {
        type: { type: String, default: 'desktop' },            // desktop | mobile | tablet
        os: { type: String, default: 'Other' },
        browser: { type: String, default: 'Other' },
    },
    screen: { type: String, default: '', maxlength: 20 },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

// The TTL index on createdAt is managed by ensureRetention() below (so a changed retention
// period updates the existing index instead of conflicting with it).
analyticsEventSchema.index({ kind: 1, createdAt: -1 });
analyticsEventSchema.index({ name: 1, createdAt: -1 });
analyticsEventSchema.index({ sessionId: 1, vid: 1 }, { partialFilterExpression: { vid: { $type: 'string' } } });

const AnalyticsEvent = mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', analyticsEventSchema);

// Make MongoDB delete records older than RETENTION_DAYS automatically (TTL index), and clear
// anything already older than that. Safe to run on every start.
const ensureRetention = async () => {
    const seconds = RETENTION_DAYS * 86400;
    const coll = AnalyticsEvent.collection;
    try {
        let indexes = [];
        try {
            indexes = await coll.indexes();
        } catch (e) {
            if (e.codeName !== 'NamespaceNotFound') throw e; // collection not created yet
        }
        const ttl = indexes.find((i) => i.key && i.key.createdAt === 1 && Object.keys(i.key).length === 1);
        if (!ttl) {
            await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: seconds, name: 'createdAt_ttl' });
        } else if (ttl.expireAfterSeconds !== seconds) {
            await AnalyticsEvent.db.db.command({ collMod: coll.collectionName, index: { name: ttl.name, expireAfterSeconds: seconds } });
            console.log(`Analytics: activity log retention set to ${RETENTION_DAYS} days`);
        }
        const { deletedCount } = await AnalyticsEvent.deleteMany({ createdAt: { $lt: new Date(Date.now() - seconds * 1000) } });
        if (deletedCount) console.log(`Analytics: removed ${deletedCount} records older than ${RETENTION_DAYS} days`);
    } catch (e) {
        console.warn('Analytics: could not apply the retention period —', e.message);
    }
};

module.exports = AnalyticsEvent;
module.exports.RETENTION_DAYS = RETENTION_DAYS;
module.exports.ensureRetention = ensureRetention;
