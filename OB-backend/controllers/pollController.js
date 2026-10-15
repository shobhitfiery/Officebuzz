const asyncHandler = require("express-async-handler");
const Poll = require("../models/pollModel");
const Event = require("../models/eventModel");
const { present, voterNames, pollIsOpen } = require("./eventController");
const { notify } = require("../services/notifier");

const fail = (res, msg, code = 400) => {
  res.status(code);
  throw new Error(msg);
};

// Validate the admin form. Existing options keep their votes when their _id is sent back.
const buildPoll = (body, res, existing) => {
  const question = String(body.question || "").trim();
  if (!question) fail(res, "Poll question is required");
  if (question.length > 300) fail(res, "Question is too long (300 characters max)");
  const description = String(body.description || "").trim().slice(0, 2000);

  const previous = new Map((existing?.poll?.options || []).map((o) => [String(o._id), o]));
  const seen = new Set();
  const options = (Array.isArray(body.options) ? body.options : [])
    .map((o) => ({ _id: o?._id, text: String(o?.text || "").trim().slice(0, 200) }))
    .filter((o) => o.text && !seen.has(o.text.toLowerCase()) && seen.add(o.text.toLowerCase()))
    .map((o) => {
      const prev = o._id && previous.get(String(o._id));
      return prev ? { _id: prev._id, text: o.text, votes: prev.votes } : { text: o.text, votes: [] };
    });
  if (options.length < 2) fail(res, "A poll needs at least two different options");
  if (options.length > 15) fail(res, "A poll can have at most 15 options");

  const closesAt = body.closesAt ? new Date(body.closesAt) : null;
  if (closesAt && Number.isNaN(closesAt.getTime())) fail(res, "Invalid closing date");

  const allowMultiple = !!body.allowMultiple;
  if (!allowMultiple && existing?.poll?.allowMultiple) {
    const kept = new Set();
    options.forEach((o) => {
      o.votes = (o.votes || []).filter((v) => !kept.has(String(v)) && kept.add(String(v)));
    });
  }
  const closed = !!body.closed;
  return {
    description,
    poll: { enabled: true, question, options, allowMultiple, closesAt, closed },
    closedAt: closed ? existing?.closedAt || new Date() : null,
  };
};

const shape = (doc, user, names, extra = {}) => {
  const p = present(doc, user, names);
  return {
    _id: p._id,
    source: "poll",
    question: p.poll.question,
    description: p.description || "",
    createdAt: p.createdAt,
    endedAt: p.closedAt || (p.poll.closesAt && new Date(p.poll.closesAt) < new Date() ? p.poll.closesAt : null),
    poll: p.poll,
    ...extra,
  };
};

// @route GET /api/polls?scope=active|past|all
// Standalone polls + polls attached to events, newest first.
const list = asyncHandler(async (req, res) => {
  const scope = req.query.scope || "all";
  const [polls, events] = await Promise.all([
    Poll.find({}).sort({ createdAt: -1 }).populate("createdBy", "name"),
    Event.find({ "poll.enabled": true }).sort({ startDate: -1 }),
  ]);
  const names = await voterNames([...polls, ...events], req.user);

  const items = [
    ...polls.map((p) => shape(p, req.user, names, { createdBy: p.createdBy?.name || "Admin" })),
    ...events.map((e) => {
      const p = present(e, req.user, names);
      return {
        _id: String(e._id),
        source: "event",
        eventId: String(e._id),
        eventTitle: e.title,
        eventDate: e.startDate,
        question: p.poll.question,
        description: "",
        createdAt: e.createdAt,
        endedAt: p.poll.closesAt && new Date(p.poll.closesAt) < new Date() ? p.poll.closesAt : null,
        poll: p.poll,
      };
    }),
  ]
    .filter((it) => (scope === "active" ? it.poll.isOpen : scope === "past" ? !it.poll.isOpen : true))
    .sort((a, b) => new Date(b.endedAt || b.createdAt) - new Date(a.endedAt || a.createdAt));

  res.json(items);
});

// @route POST /api/polls  (admin)  — optional { notify: true } tells everyone
const create = asyncHandler(async (req, res) => {
  const poll = await Poll.create({ ...buildPoll(req.body, res), createdBy: req.user._id });
  if (req.body.notify) {
    const closes = poll.poll.closesAt ? `\nVoting closes on ${new Date(poll.poll.closesAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.` : "";
    await notify({
      title: `New poll: ${poll.poll.question}`,
      body: `${poll.description ? `${poll.description}\n\n` : ""}Options: ${poll.poll.options.map((o) => o.text).join(" · ")}${closes}\n\nOpen OfficeBuzz → Polls to vote.`,
      type: "poll",
      link: "/polls",
      createdBy: req.user._id,
    }).catch((e) => console.error("Poll notification failed", e.message));
  }
  await poll.populate("createdBy", "name");
  res.status(201).json(shape(poll, req.user, new Map(), { createdBy: poll.createdBy?.name || "Admin" }));
});

// @route PUT /api/polls/:id  (admin)
const update = asyncHandler(async (req, res) => {
  const poll = await Poll.findById(req.params.id);
  if (!poll) fail(res, "Poll not found", 404);
  poll.set(buildPoll(req.body, res, poll));
  await poll.save();
  await poll.populate("createdBy", "name");
  res.json(shape(poll, req.user, await voterNames([poll], req.user), { createdBy: poll.createdBy?.name || "Admin" }));
});

// @route POST /api/polls/:id/close  { closed: true|false }  (admin)
const setClosed = asyncHandler(async (req, res) => {
  const poll = await Poll.findById(req.params.id);
  if (!poll) fail(res, "Poll not found", 404);
  const closed = req.body.closed !== false;
  poll.poll.closed = closed;
  poll.closedAt = closed ? new Date() : null;
  // Reopening a poll whose deadline has passed clears the deadline.
  if (!closed && poll.poll.closesAt && new Date(poll.poll.closesAt) < new Date()) poll.poll.closesAt = null;
  poll.markModified("poll");
  await poll.save();
  res.json({ ok: true, closed });
});

// @route DELETE /api/polls/:id  (admin)
const remove = asyncHandler(async (req, res) => {
  const r = await Poll.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) fail(res, "Poll not found", 404);
  res.json({ ok: true });
});

// @route POST /api/polls/:id/vote  { optionIds: [] }  — replaces your vote; [] withdraws it
const vote = asyncHandler(async (req, res) => {
  const doc = await Poll.findById(req.params.id).populate("createdBy", "name");
  if (!doc) fail(res, "Poll not found", 404);
  if (!pollIsOpen(doc.poll)) fail(res, "Voting for this poll has closed");

  const ids = [...new Set((Array.isArray(req.body.optionIds) ? req.body.optionIds : []).map(String))];
  const valid = new Set(doc.poll.options.map((o) => String(o._id)));
  if (ids.some((id) => !valid.has(id))) fail(res, "Unknown poll option");
  if (!doc.poll.allowMultiple && ids.length > 1) fail(res, "This poll allows only one choice");

  const me = String(req.user._id);
  doc.poll.options.forEach((o) => {
    o.votes = o.votes.filter((v) => String(v) !== me);
    if (ids.includes(String(o._id))) o.votes.push(req.user._id);
  });
  doc.markModified("poll");
  await doc.save();
  res.json(shape(doc, req.user, await voterNames([doc], req.user), { createdBy: doc.createdBy?.name || "Admin" }));
});

module.exports = { list, create, update, setClosed, remove, vote, _test: { buildPoll } };
