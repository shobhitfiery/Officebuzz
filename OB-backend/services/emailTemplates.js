// services/emailTemplates.js — one pre-designed email look per category.
// Used by manual sends (admin picks the category), scheduled sends and the automatic
// 10 am reminders. `suggestion` pre-fills the compose form; [Name]-style placeholders
// are meant to be replaced by the admin before sending.

const appUrl = () => (process.env.APP_URL || 'http://10.220.84.66:5001').trim().replace(/\/+$/, '');
const INTRANET_NOTE = '🔒 OfficeBuzz runs on the Fiery intranet, so it opens only on the office network or over a VPN connection. Working from home? Connect to the VPN first.';

const TEMPLATES = {
    account_setup: {
        label: 'Account setup / first login',
        icon: '🔐',
        accent: '#e0262f',
        banner: '#fff5f5',
        eyebrow: 'Your OfficeBuzz account is ready',
        decoration: '🎂 🎉 📅 📊 🫙',
        closing: 'It takes less than two minutes — and it makes sure nobody misses your celebrations. See you on OfficeBuzz! 🐝',
        note: INTRANET_NOTE,
        button: { label: 'Log in to OfficeBuzz', path: '/signin' },
        suggestion: () => ({
            title: 'Welcome to OfficeBuzz — log in and set up your account today!',
            body: [
                'Hi team! 👋',
                '',
                'OfficeBuzz is our team’s home for all things fun — birthdays, anniversaries, events, polls, the fun-jar ledger and the leaderboard, all in one place.',
                '',
                'Your account is ready. Here’s how to get in:',
                `1️⃣  Open OfficeBuzz: ${appUrl()}`,
                '2️⃣  Email: your official Fiery email ID (yourname@fiery.com)',
                '3️⃣  Password: Fiery.1',
                '',
                '⚡ On priority, right after you log in:',
                '•  Reset your password — click your name (top-right) → 🔑 Change password. We’ll email you a one-time code.',
                '•  Update your profile — click your name → 👤 Edit profile and add your photo, birthday, anniversary, joining date and phone number.',
            ].join('\n'),
        }),
    },
    birthday: {
        label: 'Birthday',
        icon: '🎂',
        accent: '#e8590c',
        banner: '#fff4e6',
        eyebrow: 'Birthday celebration',
        decoration: '🎈 🎉 🎁 🎊 🎈',
        closing: "Drop a wish, share a smile — let's make their day extra special!",
        suggestion: {
            title: "Happy Birthday, [Name]!",
            body: "It's [Name]'s birthday today! 🎉\n\nJoin us for cake at [time] at [place], and don't forget to send your wishes.",
        },
    },
    anniversary: {
        label: 'Marriage anniversary',
        icon: '💍',
        accent: '#c2255c',
        banner: '#fff0f6',
        eyebrow: 'Marriage anniversary',
        decoration: '💐 💕 🥂 💕 💐',
        closing: "Here's to love, laughter and many more happy years together.",
        suggestion: {
            title: 'Happy anniversary, [Name]!',
            body: '[Name] is celebrating their wedding anniversary today. 💕\n\nSend them your warmest wishes!',
        },
    },
    work_anniversary: {
        label: 'Work anniversary',
        icon: '🏆',
        accent: '#b35c00',
        banner: '#fff9db',
        eyebrow: 'Work anniversary',
        decoration: '⭐ 🚀 🏅 🚀 ⭐',
        closing: 'Thank you for everything you bring to the team — here’s to the next milestone!',
        suggestion: {
            title: '[Name] completes [N] years with us!',
            body: 'Today marks [N] years of [Name] at Fiery. 🏆\n\nThank you for your hard work and the great vibes — congratulations!',
        },
    },
    celebration: {
        label: "Today's celebrations",
        icon: '🎉',
        accent: '#6741d9',
        banner: '#f3f0ff',
        eyebrow: "Today's celebrations",
        decoration: '🎂 💍 🏆 🎈',
        closing: 'Drop them a message and make their day!',
        auto: true, // only used by the automatic reminder when several kinds fall on one day
    },
    event: {
        label: 'Event',
        icon: '📅',
        accent: '#1971c2',
        banner: '#e7f5ff',
        eyebrow: 'Team event',
        decoration: '🎶 🍕 🎯 🍕 🎶',
        closing: 'See you there — bring your best energy!',
        suggestion: {
            title: '[Event name] on [date]',
            body: "Join us for [event name]!\n\n📍 Venue: [venue]\n🕒 Time: [time]\n🎯 Activities: [activities]\n\nSee you there!",
        },
    },
    poll: {
        label: 'Polling',
        icon: '📊',
        accent: '#0c8599',
        banner: '#e3fafc',
        eyebrow: 'Poll — your vote counts',
        decoration: '🗳️ ✅ 🗳️',
        closing: 'It only takes a few seconds — open OfficeBuzz and cast your vote.',
        suggestion: {
            title: 'Vote now: [question]',
            body: "We'd love your input on [topic].\n\nOptions: [option 1] · [option 2] · [option 3]\n\nVoting closes on [date]. Open OfficeBuzz → Polls to vote.",
        },
    },
    festival: {
        label: 'Festival',
        icon: '🪔',
        accent: '#d9480f',
        banner: '#fff4e6',
        eyebrow: 'Festival greetings',
        decoration: '🪔 ✨ 🎆 ✨ 🪔',
        closing: 'Wishing you and your family joy, light and prosperity.',
        suggestion: {
            title: 'Happy [Festival]!',
            body: 'Wishing everyone a very happy [Festival]! ✨\n\nWe’re celebrating in the office on [date] at [time] — dress up and join the fun!',
        },
    },
    info: {
        label: 'General info',
        icon: '📢',
        accent: '#364fc7',
        banner: '#edf2ff',
        eyebrow: 'Team update',
        decoration: '',
        closing: 'Questions? Reach out to the OfficeBuzz admins.',
        suggestion: { title: '', body: '' },
    },
    farewell: {
        label: 'Farewell',
        icon: '👋',
        accent: '#5f3dc4',
        banner: '#f3f0ff',
        eyebrow: 'Farewell',
        decoration: '🌅 ✈️ 💜 ✈️ 🌅',
        closing: 'Thank you for the memories — stay in touch and all the best for what’s next!',
        suggestion: {
            title: 'Farewell, [Name]!',
            body: "[Name]'s last day with us is [date]. 💜\n\nJoin us for a farewell get-together at [time] at [place] and share your best wishes.",
        },
    },
    welcome: {
        label: 'Welcome / new joiner',
        icon: '🙌',
        accent: '#2b8a3e',
        banner: '#ebfbee',
        eyebrow: 'Welcome aboard',
        decoration: '🌱 🤝 🌟 🤝 🌱',
        closing: 'Say hello and help them feel at home!',
        suggestion: {
            title: 'Please welcome [Name] to the team!',
            body: '[Name] joins us as [role] starting [date]. 🙌\n\nDrop by and say hi!',
        },
    },
    fun_jar: {
        label: 'Fun-jar contribution',
        icon: '🫙',
        accent: '#e0262f',
        banner: '#fff5f5',
        eyebrow: 'Fun-jar contribution',
        decoration: '💰 🎉 🍰 🎉 💰',
        closing: 'Every contribution funds cakes, outings and celebrations for all of us — thank you!',
        suggestion: {
            title: 'Fun-jar contributions for [month]',
            body: "It's time for this month's fun-jar contribution of ₹[amount].\n\nScan the QR code on the OfficeBuzz dashboard (or pay UPI ID hemantkrishna5@oksbi) and email the payment screenshot to hemant.naik@fiery.com.",
        },
    },
    reminder: {
        label: 'Reminder',
        icon: '⏰',
        accent: '#e67700',
        banner: '#fff9db',
        eyebrow: 'Friendly reminder',
        decoration: '',
        closing: 'Thanks for keeping things running smoothly!',
        suggestion: { title: 'Reminder: [what]', body: 'A quick reminder that [what] is due on [date].' },
    },
    other: {
        label: 'Other',
        icon: '✉️',
        accent: '#e0262f',
        banner: '#f8f9fa',
        eyebrow: 'Announcement',
        decoration: '',
        closing: '',
        suggestion: { title: '', body: '' },
    },
};

// Older notifications were saved as 'manual' — show them with the general-info look.
const ALIASES = { manual: 'info' };

const TYPES = [...Object.keys(TEMPLATES), ...Object.keys(ALIASES)];

const resolveType = (type) => {
    const t = ALIASES[type] || type;
    return TEMPLATES[t] ? t : 'info';
};
const templateFor = (type) => TEMPLATES[resolveType(type)];

// Categories an admin can pick when composing (automatic-only ones excluded).
const pickable = () =>
    Object.entries(TEMPLATES)
        .filter(([, t]) => !t.auto)
        .map(([key, t]) => ({
            key,
            label: t.label,
            icon: t.icon,
            accent: t.accent,
            suggestion: (typeof t.suggestion === 'function' ? t.suggestion() : t.suggestion) || { title: '', body: '' },
            canResetPasswords: key === 'account_setup',
        }));

// Validate a category coming from the client.
const cleanType = (type, fallback = 'info') => (typeof type === 'string' && TEMPLATES[type] && !TEMPLATES[type].auto ? type : fallback);

module.exports = { TEMPLATES, TYPES, templateFor, resolveType, pickable, cleanType };
