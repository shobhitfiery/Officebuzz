// services/mailer.js — outgoing email via SMTP (nodemailer).
const nodemailer = require('nodemailer');
const { templateFor } = require('./emailTemplates');

let transporter = null;

const isConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
    if (!isConfigured()) return null;
    if (!transporter) {
        const port = Number(process.env.SMTP_PORT) || 587;
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
            requireTLS: port !== 465,
            auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s+/g, '') },
            pool: true,
            maxConnections: 3,
        });
    }
    return transporter;
};

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Every email carries an "Open OfficeBuzz dashboard" button pointing at APP_URL/dashboard
// (signed-out users land on sign-in and are sent on to the dashboard afterwards).
// Set EMAIL_LINKS=false in .env to drop the button. Without APP_URL there is no address to link to.
const appBase = () => (process.env.APP_URL || '').trim().replace(/\/+$/, '');
const linkUrl = (path = '/dashboard') => {
    if (String(process.env.EMAIL_LINKS || '').toLowerCase() === 'false') return null;
    const base = appBase();
    if (!/^https?:\/\/[^\s/]+/i.test(base)) return null;
    return `${base}${path}`;
};

const buttonRow = (url, color = '#e0262f', label = 'Open OfficeBuzz dashboard') => url
    ? `<tr><td style="padding:0 24px 28px"><a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(label)}</a></td></tr>`
    : `<tr><td style="padding:0 24px 26px;font-size:13px;color:#6b6a72">Open OfficeBuzz on the office network to see more.</td></tr>`;

const buttonText = (url, label = 'Open OfficeBuzz dashboard') => (url ? `${label}: ${url}` : 'Open OfficeBuzz on the office network to see more.');

// Escape, then turn plain http(s) links in the message into clickable links.
const linkify = (text, color) =>
    escapeHtml(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:${color};font-weight:600">${u}</a>`);

if (!appBase()) console.warn('APP_URL is not set — emails will go out without the "Open OfficeBuzz dashboard" button.');

// Plain subject (no emoji) — emoji-heavy subjects raise spam scores.
const subjectFor = (title) => `OfficeBuzz: ${String(title).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim()}`;

// Pre-designed look per category (see services/emailTemplates.js): coloured banner with
// icon, category label and decoration, the message, a closing line and the dashboard button.
const renderEmail = ({ title, body, type }) => {
    const t = templateFor(type);
    const url = linkUrl(t.button?.path);
    const btnLabel = t.button?.label;
    const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d22">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e0">
      <tr><td style="background:#17171c;padding:16px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#ffffff;font-size:18px;font-weight:700">Office<span style="color:#ff5a61">Buzz</span></td>
          <td align="right" style="color:#c9c8cf;font-size:12px;font-weight:600;letter-spacing:.04em">${escapeHtml(t.label.toUpperCase())}</td>
        </tr></table>
      </td></tr>
      <tr><td bgcolor="${t.banner}" style="background:${t.banner};border-bottom:4px solid ${t.accent};padding:28px 24px 22px;text-align:center">
        <div style="font-size:52px;line-height:1.1">${t.icon}</div>
        ${t.decoration ? `<div style="font-size:18px;letter-spacing:6px;margin-top:8px">${t.decoration}</div>` : ''}
        <div style="margin-top:12px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${t.accent}">${escapeHtml(t.eyebrow)}</div>
        <div style="margin-top:8px;font-size:22px;line-height:1.3;font-weight:800;color:#1d1d22">${escapeHtml(title)}</div>
      </td></tr>
      <tr><td style="padding:22px 24px 18px;font-size:15px;line-height:1.6;white-space:pre-line">${linkify(body, t.accent)}</td></tr>
      ${t.note ? `<tr><td style="padding:0 24px 18px"><div style="background:#f1f3f5;border:1px solid #dee2e6;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;color:#343a40"><strong>Note:</strong> ${escapeHtml(t.note)}</div></td></tr>` : ''}
      ${t.closing ? `<tr><td style="padding:0 24px 22px"><div style="border-left:4px solid ${t.accent};background:${t.banner};border-radius:6px;padding:12px 14px;font-size:14px;line-height:1.5;color:#3b3a42;font-style:italic">${escapeHtml(t.closing)}</div></td></tr>` : ''}
      ${buttonRow(url, t.accent, btnLabel)}
    </table>
    <p style="font-size:12px;color:#9a99a1;margin:14px 0 0">You're receiving this because you have an OfficeBuzz account.</p>
  </td></tr></table></body></html>`;
    const text = `${t.icon} ${t.eyebrow.toUpperCase()}\n\n${title}\n\n${body}${t.note ? `\n\nNote: ${t.note}` : ''}${t.closing ? `\n\n${t.closing}` : ''}\n\n${buttonText(url, btnLabel)}\n\n— OfficeBuzz (you're receiving this because you have an OfficeBuzz account)`;
    return { html, text };
};

// Sends ONE email with every recipient in the "To" line (so everyone can see who else got it).
// Gmail caps recipients per message, so very large lists are split into batches of
// MAIL_MAX_RECIPIENTS (default 90). Set MAIL_MODE=individual in .env to go back to
// one email per person. Returns { sent, failed, errors } counted per recipient.
const sendToMany = async (emails, message) => {
    const list = [...new Set((emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    const t = getTransporter();
    if (!t) return { sent: 0, failed: list.length, errors: list.length ? ['Email is not configured (SMTP_* settings missing)'] : [] };
    if (!list.length) return { sent: 0, failed: 0, errors: [] };

    const { html, text } = renderEmail(message);
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    const base = { from, replyTo: process.env.MAIL_REPLY_TO || from, subject: subjectFor(message.title), text, html };

    const individual = String(process.env.MAIL_MODE || '').toLowerCase() === 'individual';
    const size = individual ? 1 : Math.max(1, Math.min(Number(process.env.MAIL_MAX_RECIPIENTS) || 90, 450));
    const batches = [];
    for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));

    let sent = 0;
    const errors = [];
    const results = await Promise.allSettled(batches.map((to) => t.sendMail({ ...base, to: to.join(', ') })));
    results.forEach((r, i) => {
        const batch = batches[i];
        if (r.status === 'rejected') {
            errors.push(`${batch.length > 1 ? `${batch.length} recipients` : batch[0]}: ${r.reason?.message || r.reason}`);
            return;
        }
        // The server can accept the message but refuse individual addresses.
        const rejected = (r.value?.rejected || []).map((a) => String(a?.address || a).toLowerCase());
        rejected.forEach((a) => errors.push(`${a}: rejected by the mail server`));
        sent += batch.length - rejected.length;
    });
    return { sent, failed: list.length - sent, errors };
};

const verify = async () => {
    const t = getTransporter();
    if (!t) return { ok: false, error: 'SMTP settings missing' };
    try {
        await t.verify();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

// Password-reset code email.
const sendOtp = async (to, name, code, minutes) => {
    const t = getTransporter();
    if (!t) throw new Error('Email is not configured (SMTP_* settings missing)');
    const first = String(name || '').split(' ')[0] || 'there';
    const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d22">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e0">
      <tr><td style="background:#17171c;padding:18px 24px;color:#fff;font-size:18px;font-weight:700">Office<span style="color:#ff5a61">Buzz</span></td></tr>
      <tr><td style="padding:26px 24px 6px;font-size:16px">Hi ${escapeHtml(first)},</td></tr>
      <tr><td style="padding:6px 24px 16px;font-size:15px;line-height:1.55">Use this code to reset your OfficeBuzz password:</td></tr>
      <tr><td align="center" style="padding:6px 24px 18px"><div style="display:inline-block;font-family:Menlo,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:10px;background:#f6f5f2;border:1px solid #e7e5e0;border-radius:12px;padding:14px 22px">${escapeHtml(code)}</div></td></tr>
      <tr><td style="padding:0 24px 26px;font-size:13px;line-height:1.55;color:#6b6a72">The code expires in ${minutes} minutes and can only be used once. If you didn't ask to reset your password, you can ignore this email — your password won't change.</td></tr>
      ${buttonRow(linkUrl())}
    </table>
  </td></tr></table></body></html>`;
    const text = `Hi ${first},\n\nYour OfficeBuzz password reset code is: ${code}\n\nIt expires in ${minutes} minutes and can only be used once. If you didn't ask for this, ignore this email.\n\n${buttonText(linkUrl())}`;
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject: 'OfficeBuzz: your password reset code', text, html });
};

// Welcome email for an account an admin created (no password in the email).
const sendWelcome = async (to, name) => {
    const t = getTransporter();
    if (!t) throw new Error('Email is not configured (SMTP_* settings missing)');
    const first = String(name || '').split(' ')[0] || 'there';
    const body = `An OfficeBuzz account has been created for you (${to}).\n\nTo choose your password: open OfficeBuzz, click "Forgot password?" on the sign-in page and enter this email address — we'll send you a one-time code.\n\nYour admin may also share a temporary password with you directly.`;
    const { html, text } = renderEmail({ title: `Welcome to OfficeBuzz, ${first}!`, body, type: 'welcome' });
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject: 'OfficeBuzz: your account is ready', text, html });
};

module.exports = { isConfigured, sendToMany, verify, renderEmail, subjectFor, linkUrl, sendOtp, sendWelcome };
