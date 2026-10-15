const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Notification = require("../models/notificationModel");
const PushSubscription = require("../models/pushSubscriptionModel");
const User = require("../models/userModel");
const { notify } = require("../services/notifier");
const push = require("../services/push");
const mailer = require("../services/mailer");
const { runDailyReminders } = require("../services/dailyReminders");
const templates = require("../services/emailTemplates");
const { resetMemberPasswords } = require("./authController");
const { track } = require("../services/analytics");

const forUser = (n, userId) => ({
  _id: n._id,
  title: n.title,
  body: n.body,
  type: n.type,
  link: n.link,
  createdAt: n.createdAt,
  read: (n.readBy || []).some((id) => String(id) === String(userId)),
});

// @route GET /api/notifications  — my inbox (latest 100)
const getMine = asyncHandler(async (req, res) => {
  const list = await Notification.find({ recipients: req.user._id })
    .select("title body type link createdAt readBy")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json(list.map((n) => forUser(n, req.user._id)));
});

// @route GET /api/notifications/unread-count
const unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ recipients: req.user._id, readBy: { $ne: req.user._id } });
  res.json({ count });
});

// @route POST /api/notifications/:id/read
const markRead = asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, recipients: req.user._id }, { $addToSet: { readBy: req.user._id } });
  res.json({ ok: true });
});

// @route POST /api/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipients: req.user._id, readBy: { $ne: req.user._id } }, { $addToSet: { readBy: req.user._id } });
  res.json({ ok: true });
});

// @route GET /api/notifications/sent  (admin) — everything sent, with delivery stats
const getSent = asyncHandler(async (req, res) => {
  const list = await Notification.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("createdBy", "name")
    .populate("recipients", "name email")
    .lean();
  res.json(
    list.map((n) => ({
      _id: n._id,
      title: n.title,
      body: n.body,
      type: n.type,
      audience: n.audience,
      createdAt: n.createdAt,
      createdBy: n.createdBy ? n.createdBy.name : "Automatic",
      recipients: (n.recipients || []).map((u) => ({ _id: u._id, name: u.name, email: u.email })),
      readCount: (n.readBy || []).length,
      channels: n.channels,
      delivery: n.delivery,
    }))
  );
});

// @route POST /api/notifications  (admin) — manual notification
// { title, body, audience: 'all' | 'selected', userIds: [], sendEmail, sendPush }
const send = asyncHandler(async (req, res) => {
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "").trim();
  if (!title) {
    res.status(400);
    throw new Error("Title is required");
  }
  if (!body) {
    res.status(400);
    throw new Error("Message is required");
  }
  if (title.length > 150 || body.length > 5000) {
    res.status(400);
    throw new Error("Title or message is too long");
  }
  const sendEmail = req.body.sendEmail !== false;
  const sendPush = req.body.sendPush !== false;
  if (!sendEmail && !sendPush) {
    res.status(400);
    throw new Error("Choose at least one channel (email or push)");
  }

  let recipients = "all";
  if (req.body.audience === "selected") {
    const ids = [...new Set((Array.isArray(req.body.userIds) ? req.body.userIds : []).map(String))].filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    const found = await User.find({ _id: { $in: ids } }).select("_id").lean();
    if (!found.length) {
      res.status(400);
      throw new Error("Choose at least one recipient");
    }
    recipients = found.map((u) => u._id);
  }

  // "Account setup" emails can give every member (non-admin) a temporary password first,
  // so the password written in the email works the moment it arrives.
  let membersReset = 0;
  if (req.body.type === "account_setup" && req.body.resetMemberPasswords === true) {
    const temp = String(req.body.tempPassword || "");
    if (!body.includes(temp)) {
      res.status(400);
      throw new Error(`The message doesn't mention the temporary password "${temp}". Add it so people know what to use.`);
    }
    try {
      membersReset = await resetMemberPasswords(temp);
    } catch (e) {
      res.status(e.status || 500);
      throw e;
    }
    track("member_passwords_reset", req, { meta: { count: membersReset } });
  }

  const n = await notify({
    title,
    body,
    type: templates.cleanType(req.body.type),
    recipients,
    createdBy: req.user._id,
    channels: { email: sendEmail, push: sendPush },
  });
  res.status(201).json({ _id: n._id, recipients: n.recipients.length, status: "sending", membersReset });
});

// @route DELETE /api/notifications/:id  (admin) — remove from everyone's inbox
const remove = asyncHandler(async (req, res) => {
  const r = await Notification.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) {
    res.status(404);
    throw new Error("Notification not found");
  }
  res.json({ ok: true });
});

// @route GET /api/notifications/push/public-key
const pushKey = asyncHandler(async (req, res) => {
  res.json({ publicKey: push.publicKey() });
});

// @route POST /api/notifications/push/subscribe  { subscription }
const subscribe = asyncHandler(async (req, res) => {
  const s = req.body.subscription || {};
  if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) {
    res.status(400);
    throw new Error("Invalid push subscription");
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint: s.endpoint },
    { user: req.user._id, endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, userAgent: String(req.headers["user-agent"] || "").slice(0, 300) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ ok: true });
});

// @route POST /api/notifications/push/unsubscribe  { endpoint }
const unsubscribe = asyncHandler(async (req, res) => {
  if (req.body.endpoint) await PushSubscription.deleteOne({ endpoint: req.body.endpoint, user: req.user._id });
  res.json({ ok: true });
});

// @route GET /api/notifications/status  (admin) — is email/push set up, how many devices
const status = asyncHandler(async (req, res) => {
  const [devices, usersWithPush, smtp] = await Promise.all([
    PushSubscription.countDocuments(),
    PushSubscription.distinct("user"),
    mailer.verify(),
  ]);
  res.json({
    email: { configured: mailer.isConfigured(), ok: smtp.ok, error: smtp.ok ? null : smtp.error, from: process.env.SMTP_USER || null },
    push: { configured: !!push.publicKey(), devices, users: usersWithPush.length },
    reminderHour: Number(process.env.DAILY_REMINDER_HOUR || 10),
  });
});

// @route POST /api/notifications/run-daily  (admin) — send today's reminders now if not sent yet
const runDaily = asyncHandler(async (req, res) => {
  res.json(await runDailyReminders());
});

// @route GET /api/notifications/templates  (admin) — categories for the compose dropdown
const listTemplates = asyncHandler(async (req, res) => {
  res.json(templates.pickable());
});

// @route POST /api/notifications/preview  (admin) — { type, title, body } → rendered email
const preview = asyncHandler(async (req, res) => {
  const type = templates.cleanType(req.body.type);
  const title = String(req.body.title || "").trim() || "Your title appears here";
  const body = String(req.body.body || "").trim() || "Your message appears here.";
  const { html } = mailer.renderEmail({ title, body, type });
  res.json({ subject: mailer.subjectFor(title), html });
});

module.exports = {
  listTemplates,
  preview, getMine, unreadCount, markRead, markAllRead, getSent, send, remove, pushKey, subscribe, unsubscribe, status, runDaily };
