// controllers/analyticsController.js — collect usage events and report on them (admins).
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/analyticsEventModel');
const User = require('../models/userModel');
const { parseUA, normalizePath, clean } = require('../services/analytics');

const TZ = process.env.ANALYTICS_TZ || 'Asia/Kolkata';
const RETENTION_DAYS = AnalyticsEvent.RETENTION_DAYS || 30;
const MAX_DAYS = RETENTION_DAYS; // nothing older is kept
const ACTION_NAME = /^[a-z][a-z0-9_]{1,59}$/;

// ---------- Collecting ----------

// Who is calling? A valid bearer token identifies the user; anything else is anonymous.
// (Never fails — sign-in pages are tracked too.)
const userFromToken = (req) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    try {
        const { id } = jwt.verify(h.slice(7), process.env.JWT_SECRET);
        return mongoose.Types.ObjectId.isValid(id) ? id : null;
    } catch {
        return null;
    }
};

// Simple per-IP throttle so a buggy tab can't flood the collection.
const hits = new Map();
const throttled = (ip) => {
    const now = Date.now();
    const h = hits.get(ip) || { start: now, n: 0 };
    if (now - h.start > 60e3) {
        h.start = now;
        h.n = 0;
    }
    h.n += 1;
    hits.set(ip, h);
    if (hits.size > 5000) hits.clear();
    return h.n > 120;
};

// @route POST /api/analytics/track — { sessionId, screen, events: [{ kind, name, path, title, duration, ts, meta }] }
const collect = asyncHandler(async (req, res) => {
    if (throttled(req.ip)) return res.status(429).json({ message: 'Too many analytics requests' });
    const events = Array.isArray(req.body.events) ? req.body.events.slice(0, 50) : [];
    const user = userFromToken(req);
    const device = parseUA(req.headers['user-agent']);
    const sessionId = clean(req.body.sessionId, 64);
    const screen = clean(req.body.screen, 20);
    const now = Date.now();

    const docs = events
        .map((e) => {
            const kind = e?.kind === 'action' ? 'action' : 'pageview';
            const name = kind === 'pageview' ? 'pageview' : clean(e.name, 60);
            if (kind === 'action' && !ACTION_NAME.test(name)) return null;
            const ts = Number(e.ts);
            // Accept client timestamps only within the last day (and never in the future).
            const createdAt = Number.isFinite(ts) && ts <= now + 60e3 && ts > now - 864e5 ? new Date(Math.min(ts, now)) : new Date(now);
            let meta;
            if (e.meta && typeof e.meta === 'object' && !Array.isArray(e.meta)) {
                meta = {};
                Object.entries(e.meta).slice(0, 8).forEach(([k, v]) => {
                    if (/^[a-zA-Z0-9_]{1,30}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v)) {
                        meta[k] = typeof v === 'string' ? v.slice(0, 120) : v;
                    }
                });
                if (!Object.keys(meta).length) meta = undefined;
            }
            const vid = kind === 'pageview' && sessionId && /^[A-Za-z0-9_-]{6,40}$/.test(String(e.vid || '')) ? String(e.vid) : undefined;
            return {
                kind,
                name,
                vid,
                path: normalizePath(clean(e.path, 300)),
                title: clean(e.title, 150),
                duration: Math.max(0, Math.min(Number(e.duration) || 0, 4 * 3600e3)), // cap at 4 h
                user,
                sessionId,
                screen,
                device,
                source: 'web',
                meta,
                createdAt,
            };
        })
        .filter(Boolean);

    // A page view is reported when it starts and again (with the time spent) when the visitor
    // leaves or hides the tab, so those are upserted by (session, view id) keeping the longest time.
    const views = docs.filter((d) => d.vid);
    const rest = docs.filter((d) => !d.vid);
    if (views.length) {
        await AnalyticsEvent.bulkWrite(
            views.map(({ duration, ...d }) => ({
                updateOne: {
                    filter: { sessionId: d.sessionId, vid: d.vid },
                    update: { $setOnInsert: d, $max: { duration } },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }
    if (rest.length) await AnalyticsEvent.insertMany(rest, { ordered: false });
    res.status(204).end();
});

// ---------- Reporting ----------

const rangeOf = (q) => {
    const days = Math.min(Math.max(parseInt(q.days, 10) || 30, 1), MAX_DAYS);
    const until = new Date();
    const since = new Date(until.getTime() - days * 864e5);
    return { days, since, until };
};

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const pct = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

const totalsFor = async (since, until) => {
    const [r] = await AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: since, $lt: until } } },
        {
            $group: {
                _id: null,
                views: { $sum: { $cond: [{ $eq: ['$kind', 'pageview'] }, 1, 0] } },
                actions: { $sum: { $cond: [{ $eq: ['$kind', 'action'] }, 1, 0] } },
                logins: { $sum: { $cond: [{ $eq: ['$name', 'login'] }, 1, 0] } },
                failedLogins: { $sum: { $cond: [{ $eq: ['$name', 'login_failed'] }, 1, 0] } },
                timeOnPages: { $sum: '$duration' },
                users: { $addToSet: '$user' },
                sessions: { $addToSet: '$sessionId' },
            },
        },
    ]);
    if (!r) return { views: 0, actions: 0, logins: 0, failedLogins: 0, users: 0, sessions: 0, timeOnPages: 0, avgSessionMs: 0 };
    const users = r.users.filter(Boolean).length;
    const sessions = r.sessions.filter(Boolean).length;
    return {
        views: r.views,
        actions: r.actions,
        logins: r.logins,
        failedLogins: r.failedLogins,
        users,
        sessions,
        timeOnPages: r.timeOnPages,
        avgSessionMs: sessions ? Math.round(r.timeOnPages / sessions) : 0,
    };
};

// @route GET /api/analytics/summary?days=30  (admin)
const summary = asyncHandler(async (req, res) => {
    const { days, since, until } = rangeOf(req.query);
    const match = { createdAt: { $gte: since, $lt: until } };
    const prevSince = new Date(since.getTime() - days * 864e5);

    const [totals, prev, daily, hourly, pages, people, devices, actions, allUsers] = await Promise.all([
        totalsFor(since, until),
        totalsFor(prevSince, since),
        AnalyticsEvent.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
                    views: { $sum: { $cond: [{ $eq: ['$kind', 'pageview'] }, 1, 0] } },
                    actions: { $sum: { $cond: [{ $eq: ['$kind', 'action'] }, 1, 0] } },
                    users: { $addToSet: '$user' },
                },
            },
        ]),
        AnalyticsEvent.aggregate([
            { $match: { ...match, kind: 'pageview' } },
            { $group: { _id: { $hour: { date: '$createdAt', timezone: TZ } }, views: { $sum: 1 } } },
        ]),
        AnalyticsEvent.aggregate([
            { $match: { ...match, kind: 'pageview' } },
            {
                $group: {
                    _id: '$path',
                    views: { $sum: 1 },
                    users: { $addToSet: '$user' },
                    time: { $sum: '$duration' },
                    timed: { $sum: { $cond: [{ $gt: ['$duration', 0] }, 1, 0] } },
                },
            },
            { $sort: { views: -1 } },
            { $limit: 25 },
        ]),
        AnalyticsEvent.aggregate([
            { $match: { ...match, user: { $ne: null } } },
            {
                $group: {
                    _id: '$user',
                    views: { $sum: { $cond: [{ $eq: ['$kind', 'pageview'] }, 1, 0] } },
                    actions: { $sum: { $cond: [{ $eq: ['$kind', 'action'] }, 1, 0] } },
                    logins: { $sum: { $cond: [{ $eq: ['$name', 'login'] }, 1, 0] } },
                    time: { $sum: '$duration' },
                    sessions: { $addToSet: '$sessionId' },
                    days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } } },
                    lastSeen: { $max: '$createdAt' },
                    devices: { $addToSet: '$device.type' },
                },
            },
            { $sort: { views: -1, actions: -1 } },
        ]),
        AnalyticsEvent.aggregate([
            { $match: { ...match, kind: 'pageview' } },
            {
                $facet: {
                    type: [{ $group: { _id: '$device.type', views: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } }],
                    os: [{ $group: { _id: '$device.os', views: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } }],
                    browser: [{ $group: { _id: '$device.browser', views: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } }],
                },
            },
        ]),
        AnalyticsEvent.aggregate([
            { $match: { ...match, kind: 'action' } },
            { $group: { _id: '$name', count: { $sum: 1 }, users: { $addToSet: '$user' }, last: { $max: '$createdAt' } } },
            { $sort: { count: -1 } },
        ]),
        User.find({}).select('name email isAdmin').lean(),
    ]);

    // Zero-filled daily series, in the reporting time zone.
    const byDay = new Map(daily.map((d) => [d._id, d]));
    const series = [];
    for (let t = since.getTime(); t <= until.getTime() + 1; t += 864e5) {
        const key = dayKey(new Date(t));
        if (series.length && series[series.length - 1].date === key) continue;
        const d = byDay.get(key);
        series.push({ date: key, views: d?.views || 0, actions: d?.actions || 0, users: d ? d.users.filter(Boolean).length : 0 });
    }
    const lastKey = dayKey(until);
    if (series[series.length - 1]?.date !== lastKey) {
        const d = byDay.get(lastKey);
        series.push({ date: lastKey, views: d?.views || 0, actions: d?.actions || 0, users: d ? d.users.filter(Boolean).length : 0 });
    }

    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: hourly.find((x) => x._id === h)?.views || 0 }));

    const userMap = new Map(allUsers.map((u) => [String(u._id), u]));
    const peopleOut = people.map((p) => {
        const u = userMap.get(String(p._id));
        return {
            userId: p._id,
            name: u?.name || 'Deleted user',
            email: u?.email || '',
            isAdmin: !!u?.isAdmin,
            views: p.views,
            actions: p.actions,
            logins: p.logins,
            sessions: p.sessions.filter(Boolean).length,
            activeDays: p.days.length,
            timeMs: p.time,
            lastSeen: p.lastSeen,
            devices: p.devices.filter(Boolean),
        };
    });
    const activeIds = new Set(people.map((p) => String(p._id)));
    const inactive = allUsers
        .filter((u) => !activeIds.has(String(u._id)))
        .map((u) => ({ userId: u._id, name: u.name, email: u.email }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const breakdown = (rows) =>
        rows
            .map((r) => ({ label: r._id || 'Other', views: r.views, sessions: r.sessions.filter(Boolean).length }))
            .sort((a, b) => b.views - a.views);
    const dev = devices[0] || { type: [], os: [], browser: [] };

    res.json({
        days,
        timezone: TZ,
        since,
        until,
        totals,
        previous: prev,
        retentionDays: RETENTION_DAYS,
        // The previous period is only fully available when 2× the range fits in the retention window.
        comparable: days * 2 <= RETENTION_DAYS,
        change: days * 2 <= RETENTION_DAYS
            ? {
                views: pct(totals.views, prev.views),
                users: pct(totals.users, prev.users),
                sessions: pct(totals.sessions, prev.sessions),
                logins: pct(totals.logins, prev.logins),
            }
            : { views: null, users: null, sessions: null, logins: null },
        registeredUsers: allUsers.length,
        daily: series,
        hourly: hours,
        pages: pages.map((p) => ({
            path: p._id || '/',
            views: p.views,
            users: p.users.filter(Boolean).length,
            avgTimeMs: p.timed ? Math.round(p.time / p.timed) : 0,
        })),
        people: peopleOut,
        inactive,
        devices: { type: breakdown(dev.type), os: breakdown(dev.os), browser: breakdown(dev.browser) },
        actions: actions.map((a) => ({ name: a._id, count: a.count, users: a.users.filter(Boolean).length, last: a.last })),
    });
});

const eventFilter = (q) => {
    const { since, until } = rangeOf(q);
    const f = { createdAt: { $gte: since, $lt: until } };
    if (q.kind === 'pageview' || q.kind === 'action') f.kind = q.kind;
    if (typeof q.name === 'string' && ACTION_NAME.test(q.name)) f.name = q.name;
    if (q.user === 'anonymous') f.user = null;
    else if (mongoose.Types.ObjectId.isValid(q.user)) f.user = new mongoose.Types.ObjectId(q.user);
    if (typeof q.path === 'string' && q.path) f.path = q.path.slice(0, 300);
    return f;
};

const shapeEvent = (e, names) => ({
    _id: e._id,
    at: e.createdAt,
    kind: e.kind,
    name: e.name,
    path: e.path,
    title: e.title,
    durationMs: e.duration || 0,
    userId: e.user,
    user: e.user ? names.get(String(e.user)) || 'Deleted user' : 'Signed out',
    device: e.device,
    screen: e.screen,
    source: e.source,
    sessionId: e.sessionId,
    meta: e.meta,
});

const userNames = async () => new Map((await User.find({}).select('name').lean()).map((u) => [String(u._id), u.name]));

// @route GET /api/analytics/events?days&kind&name&user&path&page&limit  (admin) — detailed log
const events = asyncHandler(async (req, res) => {
    const f = eventFilter(req.query);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 5), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [total, rows, names] = await Promise.all([
        AnalyticsEvent.countDocuments(f),
        AnalyticsEvent.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        userNames(),
    ]);
    res.json({ total, page, pages: Math.max(Math.ceil(total / limit), 1), limit, items: rows.map((e) => shapeEvent(e, names)) });
});

const csvCell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Neutralise spreadsheet formulas and quote when needed.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// @route GET /api/analytics/export?days&…filters  (admin) — CSV of the detailed log (max 50,000 rows)
const exportCsv = asyncHandler(async (req, res) => {
    const f = eventFilter(req.query);
    const [rows, names] = await Promise.all([AnalyticsEvent.find(f).sort({ createdAt: -1 }).limit(50000).lean(), userNames()]);
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' });
    const header = ['Time', 'User', 'Kind', 'Name', 'Page/route', 'Title', 'Seconds on page', 'Device', 'OS', 'Browser', 'Screen', 'Session', 'Details'];
    const lines = [header.join(',')].concat(
        rows.map((e) => {
            const x = shapeEvent(e, names);
            return [
                fmt.format(new Date(x.at)), x.user, x.kind, x.name, x.path, x.title, x.durationMs ? Math.round(x.durationMs / 1000) : '',
                x.device?.type, x.device?.os, x.device?.browser, x.screen, x.sessionId, x.meta ? JSON.stringify(x.meta) : '',
            ].map(csvCell).join(',');
        })
    );
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="officebuzz-analytics-${dayKey(new Date())}.csv"`);
    res.send(`﻿${lines.join('\n')}`);
});

module.exports = { collect, summary, events, exportCsv, _test: { csvCell, eventFilter } };
