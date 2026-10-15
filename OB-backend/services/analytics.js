// services/analytics.js — record page views and actions for the admin Analytics page.
// Recording never blocks or breaks a request: failures are logged and ignored.
const AnalyticsEvent = require('../models/analyticsEventModel');

// Light user-agent parsing (no dependency): device type, OS and browser family.
const parseUA = (ua = '') => {
    const s = String(ua);
    const tablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s);
    const mobile = !tablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s);
    const os = /iPhone|iPad|iPod/i.test(s) ? 'iOS'
        : /Android/i.test(s) ? 'Android'
        : /Windows/i.test(s) ? 'Windows'
        : /Mac OS X|Macintosh/i.test(s) ? 'macOS'
        : /CrOS/i.test(s) ? 'ChromeOS'
        : /Linux/i.test(s) ? 'Linux' : 'Other';
    const browser = /Edg\//i.test(s) ? 'Edge'
        : /OPR\/|Opera/i.test(s) ? 'Opera'
        : /SamsungBrowser/i.test(s) ? 'Samsung Internet'
        : /Firefox|FxiOS/i.test(s) ? 'Firefox'
        : /CriOS|Chrome\//i.test(s) ? 'Chrome'
        : /Safari\//i.test(s) ? 'Safari' : 'Other';
    return { type: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop', os, browser };
};

// '/events/652f…' → '/events/:id' so the same page groups together in reports.
const normalizePath = (p = '') =>
    String(p)
        .split('?')[0]
        .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id')
        .replace(/\/\d+(?=\/|$)/g, '/:n')
        .slice(0, 300) || '/';

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const record = (doc) =>
    AnalyticsEvent.create(doc).catch((e) => console.warn('analytics: could not record event', e.message));

// Server-side action. `req` supplies the user (if signed in), device and session headers.
const track = (name, req, { user, meta } = {}) =>
    record({
        kind: 'action',
        name,
        source: 'server',
        path: normalizePath(req?.baseUrl ? `${req.baseUrl}${req.route?.path || ''}` : req?.originalUrl || ''),
        user: user || req?.user?._id || null,
        sessionId: clean(req?.headers?.['x-session-id'], 64),
        device: parseUA(req?.headers?.['user-agent']),
        meta: meta && Object.keys(meta).length ? meta : undefined,
    });

// Route middleware: record `name` once the request has succeeded (status < 400).
const trackAction = (name, metaFn) => (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) return;
        let meta;
        try {
            meta = metaFn ? metaFn(req, res) : req.params?.id ? { id: req.params.id } : undefined;
        } catch {
            meta = undefined;
        }
        track(name, req, { user: res.locals.analyticsUser, meta });
    });
    next();
};

module.exports = { track, trackAction, parseUA, normalizePath, record, clean };
