const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const ScheduledNotification = require("../models/scheduledNotificationModel");
const ReminderSkip = require("../models/reminderSkipModel");
const Notification = require("../models/notificationModel");
const Employee = require("../models/employeeModel");
const Event = require("../models/eventModel");
const User = require("../models/userModel");
const { celebrationsForDay } = require("./employeeController");
const { celebrationMessage, eventMessage, localDateKey, reminderHour } = require("../services/dailyReminders");
const { activeUserIds } = require("../services/notifier");
const { sendScheduled } = require("../services/scheduledSender");
const { cleanType } = require("../services/emailTemplates");

const MAX_DAYS = 90;

const validate = async (body, res) => {
  const fail = (m) => {
    res.status(400);
    throw new Error(m);
  };
  const title = String(body.title || "").trim();
  const text = String(body.body || "").trim();
  if (!title) fail("Title is required");
  if (!text) fail("Message is required");
  if (title.length > 150 || text.length > 5000) fail("Title or message is too long");
  const sendAt = new Date(body.sendAt);
  if (Number.isNaN(sendAt.getTime())) fail("Pick a valid date and time");
  if (sendAt.getTime() < Date.now() - 60 * 1000) fail("The scheduled time is in the past");
  if (sendAt.getTime() > Date.now() + 366 * 864e5) fail("You can schedule up to a year ahead");
  const channels = { email: body.sendEmail !== false, push: body.sendPush !== false };
  if (!channels.email && !channels.push) fail("Choose email, push or both");

  let audience = "all";
  let recipients = [];
  if (body.audience === "selected") {
    audience = "selected";
    const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    recipients = (await User.find({ _id: { $in: ids } }).select("_id").lean()).map((u) => u._id);
    if (!recipients.length) fail("Choose at least one recipient");
  }
  return { title, body: text, type: cleanType(body.type), sendAt, audience, recipients, channels };
};

// @route GET /api/notifications/scheduled?days=30
// Everything due to go out: automatic 10 am reminders (projected from employees/events)
// plus admin-scheduled announcements. Members only see items addressed to them.
const list = asyncHandler(async (req, res) => {
  const isAdmin = !!req.user.isAdmin;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), MAX_DAYS);
  const hour = reminderHour();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(today.getTime() + days * 864e5);

  const [employees, events, skips, everyoneIds, manual] = await Promise.all([
    Employee.find({ isActive: { $ne: false } }).lean(),
    Event.find({
      startDate: { $gte: new Date(`${localDateKey(today)}T00:00:00.000Z`), $lt: new Date(`${localDateKey(until)}T00:00:00.000Z`) },
    }).lean(),
    ReminderSkip.find({}).lean(),
    activeUserIds(),
    ScheduledNotification.find({ status: { $in: ["scheduled", "sending", "failed"] }, sendAt: { $lt: until } })
      .sort({ sendAt: 1 })
      .populate("createdBy", "name")
      .populate("recipients", "name email")
      .lean(),
  ]);
  const skipped = new Set(skips.map((s) => s.key));

  // Today's automatic reminders that already went out aren't "upcoming" any more.
  const todayKey = localDateKey(today);
  const sentToday = new Set(
    (await Notification.find({ dedupeKey: { $regex: `^daily:.*${todayKey}$` } }).select("dedupeKey").lean()).map((n) => n.dedupeKey)
  );

  const items = [];
  const at = (day) => {
    const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0);
    return t < now ? now : t; // overdue today = goes out within a few minutes
  };
  const auto = (key, msg, day) => {
    if (sentToday.has(key)) return;
    items.push({
      _id: key,
      kind: "auto",
      key,
      title: msg.title,
      body: msg.body,
      type: msg.type,
      sendAt: at(day),
      audience: "all",
      recipientCount: everyoneIds.length,
      channels: { email: true, push: true },
      status: skipped.has(key) ? "skipped" : "scheduled",
      createdBy: "Automatic",
    });
  };

  for (let d = 0; d < days; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    const key = localDateKey(day);
    const celebrations = celebrationsForDay(employees, day);
    if (celebrations.length) auto(`daily:celebrations:${key}`, celebrationMessage(celebrations), day);
    events
      .filter((e) => new Date(e.startDate).toISOString().slice(0, 10) === key)
      .forEach((e) => auto(`daily:event:${e._id}:${key}`, eventMessage(e), day));
  }

  const me = String(req.user._id);
  manual
    .filter((m) => isAdmin || m.audience === "all" || (m.recipients || []).some((r) => String(r._id) === me))
    .forEach((m) =>
      items.push({
        _id: String(m._id),
        kind: "manual",
        title: m.title,
        body: m.body,
        type: m.type || "info",
        sendAt: m.sendAt < now && m.status === "scheduled" ? now : m.sendAt,
        audience: m.audience,
        recipientCount: m.audience === "all" ? everyoneIds.length : (m.recipients || []).length,
        ...(isAdmin ? { recipients: (m.recipients || []).map((r) => ({ _id: r._id, name: r.name, email: r.email })) } : {}),
        channels: m.channels,
        status: m.status,
        error: isAdmin ? m.error : undefined,
        createdBy: m.createdBy?.name || "Admin",
      })
    );

  items.sort((a, b) => new Date(a.sendAt) - new Date(b.sendAt) || (a.kind === "auto" ? -1 : 1));
  res.json({ reminderHour: hour, days, items });
});

// @route POST /api/notifications/scheduled  (admin)
const create = asyncHandler(async (req, res) => {
  const data = await validate(req.body, res);
  const item = await ScheduledNotification.create({ ...data, createdBy: req.user._id });
  res.status(201).json(item);
});

// @route PUT /api/notifications/scheduled/:id  (admin) — only while still waiting
const update = asyncHandler(async (req, res) => {
  const item = await ScheduledNotification.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Scheduled notification not found");
  }
  if (item.status !== "scheduled" && item.status !== "failed") {
    res.status(400);
    throw new Error("This notification has already been sent");
  }
  Object.assign(item, await validate(req.body, res), { status: "scheduled", error: null });
  await item.save();
  res.json(item);
});

// @route DELETE /api/notifications/scheduled/:id  (admin) — cancel
const cancel = asyncHandler(async (req, res) => {
  const r = await ScheduledNotification.deleteOne({ _id: req.params.id, status: { $in: ["scheduled", "failed"] } });
  if (!r.deletedCount) {
    res.status(404);
    throw new Error("Nothing to cancel — it may have just been sent");
  }
  res.json({ ok: true });
});

// @route POST /api/notifications/scheduled/:id/send-now  (admin)
const sendNow = asyncHandler(async (req, res) => {
  await ScheduledNotification.updateOne({ _id: req.params.id, status: "failed" }, { $set: { status: "scheduled" } });
  const item = await sendScheduled(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Nothing to send — it may have already gone out");
  }
  res.json({ status: item.status, error: item.error });
});

// @route POST /api/notifications/auto-skip  { key, skip: true|false }  (admin)
const autoSkip = asyncHandler(async (req, res) => {
  const key = String(req.body.key || "");
  if (!/^daily:(celebrations|event):/.test(key)) {
    res.status(400);
    throw new Error("Unknown reminder");
  }
  if (req.body.skip === false) await ReminderSkip.deleteOne({ key });
  else await ReminderSkip.updateOne({ key }, { $setOnInsert: { key, skippedBy: req.user._id } }, { upsert: true });
  res.json({ ok: true, key, skipped: req.body.skip !== false });
});

module.exports = { list, create, update, cancel, sendNow, autoSkip };
