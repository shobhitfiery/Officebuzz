// services/dailyReminders.js — every day at DAILY_REMINDER_HOUR (default 10:00, server local time)
// notify everyone about today's birthdays/anniversaries and today's events.
// Safe to run repeatedly: each reminder has a per-day dedupe key, so restarts never double-send.
const Event = require('../models/eventModel');
const ReminderSkip = require('../models/reminderSkipModel');
const { findTodayCelebrations } = require('../controllers/employeeController');

const isSkipped = async (key) => !!(await ReminderSkip.exists({ key }));
const { notify } = require('./notifier');

const CHECK_EVERY_MS = 5 * 60 * 1000;

const localDateKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtTime = (hhmm) => {
    if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

const describeCelebration = (c) => {
    if (c.type === 'birthday') return `🎂 ${c.name} — Happy Birthday!`;
    if (c.type === 'anniversary') return `💝 ${c.name} — Happy Anniversary!`;
    return `🏆 ${c.name} — ${c.years} ${c.years === 1 ? 'year' : 'years'} with the team!`;
};

const celebrationMessage = (list) => {
    if (list.length === 1) {
        const c = list[0];
        const first = c.name.split(' ')[0];
        if (c.type === 'birthday') return { title: `Today is ${c.name}'s birthday!`, body: `Wish ${first} a very happy birthday today! 🎉`, type: 'birthday' };
        if (c.type === 'anniversary') return { title: `Happy anniversary, ${c.name}!`, body: `${first} is celebrating their anniversary today. Send your wishes! 💝`, type: 'anniversary' };
        return { title: `${c.name} completes ${c.years} ${c.years === 1 ? 'year' : 'years'} with us today!`, body: `Congratulate ${first} on ${c.years} ${c.years === 1 ? 'year' : 'years'} with the team! 🏆`, type: 'work_anniversary' };
    }
    return {
        title: `${list.length} celebrations today!`,
        body: `${list.map(describeCelebration).join('\n')}\n\nDrop them a message and make their day!`,
        type: list.every((c) => c.type === list[0].type) ? list[0].type : 'celebration',
    };
};

const eventMessage = (e) => {
    const time = [fmtTime(e.startTime), fmtTime(e.endTime)].filter(Boolean).join(' – ');
    const lines = [
        [time, e.venue && `at ${e.venue}`].filter(Boolean).join(' '),
        e.activities?.length ? `Activities: ${e.activities.join(', ')}` : '',
        e.details ? (e.details.length > 300 ? `${e.details.slice(0, 297)}…` : e.details) : '',
        e.poll?.enabled && !e.poll.closed ? '📊 There is an open poll for this event — cast your vote!' : '',
    ].filter(Boolean);
    return { title: `Today: ${e.title}`, body: lines.join('\n') || 'Happening today — see you there!', type: 'event', link: '/events' };
};

// Run today's reminders. Returns a summary of what was (newly) sent.
const runDailyReminders = async (now = new Date()) => {
    const key = localDateKey(now);
    const sent = [];

    const celebrations = await findTodayCelebrations();
    if (celebrations.length && !(await isSkipped(`daily:celebrations:${key}`))) {
        const msg = celebrationMessage(celebrations);
        const n = await notify({ ...msg, link: '/dashboard', dedupeKey: `daily:celebrations:${key}` });
        if (n) sent.push(n.title);
    }

    // Events starting today (event dates are stored as UTC midnight of the calendar day).
    const dayStart = new Date(`${key}T00:00:00.000Z`);
    const dayEnd = new Date(`${key}T23:59:59.999Z`);
    const events = await Event.find({ startDate: { $gte: dayStart, $lte: dayEnd } }).lean();
    for (const e of events) {
        if (await isSkipped(`daily:event:${e._id}:${key}`)) continue;
        const n = await notify({ ...eventMessage(e), dedupeKey: `daily:event:${e._id}:${key}` });
        if (n) sent.push(n.title);
    }
    return { date: key, celebrations: celebrations.length, events: events.length, newlySent: sent };
};

let timer = null;
let lastRunDay = null;

const start = () => {
    if (timer) return;
    const hour = Number.isFinite(Number(process.env.DAILY_REMINDER_HOUR)) ? Number(process.env.DAILY_REMINDER_HOUR) : 10;
    const tick = async () => {
        const now = new Date();
        const key = localDateKey(now);
        if (now.getHours() < hour || lastRunDay === key) return;
        try {
            const result = await runDailyReminders(now);
            lastRunDay = key;
            if (result.newlySent.length) console.log(`Daily reminders ${key}:`, result.newlySent);
        } catch (e) {
            console.error('Daily reminders failed (will retry):', e.message);
        }
    };
    // Check shortly after start (catches up if the server was down at 10:00), then every 5 minutes.
    setTimeout(tick, 15 * 1000);
    timer = setInterval(tick, CHECK_EVERY_MS);
    console.log(`Daily reminders scheduled for ${String(hour).padStart(2, '0')}:00 server time`);
};

module.exports = { start, runDailyReminders, celebrationMessage, eventMessage, localDateKey, reminderHour: () => (Number.isFinite(Number(process.env.DAILY_REMINDER_HOUR)) ? Number(process.env.DAILY_REMINDER_HOUR) : 10) };
