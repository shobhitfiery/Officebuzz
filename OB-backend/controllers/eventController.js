const asyncHandler = require("express-async-handler");
const Event = require("../models/eventModel");
const User = require("../models/userModel");

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const parseDay = (value) => {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

// Today's calendar date (server local) as UTC midnight, matching how event dates are stored.
const todayUtcMidnight = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

const pollIsOpen = (poll) =>
  !!poll?.enabled && !poll.closed && (!poll.closesAt || new Date(poll.closesAt) > new Date());

// Shape an event for the client: vote counts, the viewer's own votes,
// and (for admins only) who voted for what.
const present = (event, user, namesById = new Map()) => {
  const e = event.toObject ? event.toObject() : event;
  const me = String(user._id);
  const poll = e.poll || {};
  const voters = new Set();
  const options = (poll.options || []).map((o) => {
    const ids = (o.votes || []).map(String);
    ids.forEach((id) => voters.add(id));
    return {
      _id: o._id,
      text: o.text,
      count: ids.length,
      ...(user.isAdmin ? { voters: ids.map((id) => namesById.get(id) || "Former user") } : {}),
    };
  });
  const myVotes = (poll.options || []).filter((o) => (o.votes || []).map(String).includes(me)).map((o) => String(o._id));

  return {
    ...e,
    poll: poll.enabled
      ? {
          enabled: true,
          question: poll.question,
          allowMultiple: !!poll.allowMultiple,
          closesAt: poll.closesAt || null,
          closed: !!poll.closed,
          isOpen: pollIsOpen(poll),
          totalVoters: voters.size,
          options,
          myVotes,
        }
      : { enabled: false },
  };
};

const voterNames = async (events, user) => {
  if (!user.isAdmin) return new Map();
  const ids = new Set();
  events.forEach((e) => (e.poll?.options || []).forEach((o) => (o.votes || []).forEach((v) => ids.add(String(v)))));
  if (!ids.size) return new Map();
  const users = await User.find({ _id: { $in: [...ids] } }).select("name").lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
};

// Validate + normalise the admin form. Existing poll options keep their votes when their _id is sent back.
const buildEvent = (body, res, existing) => {
  const fail = (msg) => {
    res.status(400);
    throw new Error(msg);
  };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) fail("Event title is required");

  const startDate = parseDay(body.startDate);
  if (!startDate) fail("A valid start date is required");
  const endDate = body.endDate ? parseDay(body.endDate) : null;
  if (endDate === undefined) fail("Invalid end date");
  if (endDate && endDate < startDate) fail("End date can't be before the start date");

  const startTime = (body.startTime || "").trim();
  const endTime = (body.endTime || "").trim();
  if (startTime && !TIME.test(startTime)) fail("Start time must look like 14:30");
  if (endTime && !TIME.test(endTime)) fail("End time must look like 17:00");
  if (startTime && endTime && !endDate && endTime <= startTime) fail("End time must be after the start time");

  const activities = (Array.isArray(body.activities) ? body.activities : [])
    .map((a) => String(a || "").trim())
    .filter(Boolean)
    .slice(0, 30);

  const data = {
    title,
    startDate,
    endDate,
    startTime,
    endTime,
    venue: String(body.venue || "").trim(),
    activities,
    details: String(body.details || "").trim(),
  };

  const p = body.poll || {};
  if (p.enabled) {
    const question = String(p.question || "").trim();
    if (!question) fail("Poll question is required");
    const previous = new Map((existing?.poll?.options || []).map((o) => [String(o._id), o]));
    const seen = new Set();
    const options = (Array.isArray(p.options) ? p.options : [])
      .map((o) => ({ _id: o?._id, text: String(o?.text || "").trim() }))
      .filter((o) => o.text && !seen.has(o.text.toLowerCase()) && seen.add(o.text.toLowerCase()))
      .map((o) => {
        const prev = o._id && previous.get(String(o._id));
        return prev ? { _id: prev._id, text: o.text, votes: prev.votes } : { text: o.text, votes: [] };
      });
    if (options.length < 2) fail("A poll needs at least two different options");
    if (options.length > 15) fail("A poll can have at most 15 options");
    const closesAt = p.closesAt ? new Date(p.closesAt) : null;
    if (closesAt && Number.isNaN(closesAt.getTime())) fail("Invalid poll closing date");

    let allowMultiple = !!p.allowMultiple;
    // Switching to single-choice keeps only each voter's first pick.
    if (!allowMultiple && existing?.poll?.allowMultiple) {
      const kept = new Set();
      options.forEach((o) => {
        o.votes = (o.votes || []).filter((v) => !kept.has(String(v)) && kept.add(String(v)));
      });
    }
    data.poll = { enabled: true, question, options, allowMultiple, closesAt, closed: !!p.closed };
  } else {
    data.poll = { enabled: false, options: [] };
  }
  return data;
};

// @route GET /api/events?scope=upcoming|past|all  (any logged-in user)
const getEvents = asyncHandler(async (req, res) => {
  const scope = req.query.scope || "all";
  const today = todayUtcMidnight();
  // An event is upcoming until its last day has passed.
  const upcomingFilter = { $or: [{ endDate: { $gte: today } }, { endDate: null, startDate: { $gte: today } }] };
  const filter =
    scope === "upcoming" ? upcomingFilter : scope === "past" ? { $nor: [upcomingFilter] } : {};
  const sort = scope === "past" ? { startDate: -1, startTime: -1 } : { startDate: 1, startTime: 1 };

  let query = Event.find(filter).sort(sort);
  const limit = Math.min(parseInt(req.query.limit, 10) || 0, 100);
  if (limit > 0) query = query.limit(limit);
  const events = await query;
  const names = await voterNames(events, req.user);
  res.json(events.map((e) => present(e, req.user, names)));
});

// @route GET /api/events/:id
const getEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) {
    res.status(404);
    throw new Error("Event not found");
  }
  res.json(present(event, req.user, await voterNames([event], req.user)));
});

// @route POST /api/events  (admin)
const createEvent = asyncHandler(async (req, res) => {
  const event = await Event.create({ ...buildEvent(req.body, res), createdBy: req.user._id });
  res.status(201).json(present(event, req.user));
});

// @route PUT /api/events/:id  (admin)
const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) {
    res.status(404);
    throw new Error("Event not found");
  }
  event.set(buildEvent(req.body, res, event));
  await event.save();
  res.json(present(event, req.user, await voterNames([event], req.user)));
});

// @route DELETE /api/events/:id  (admin)
const deleteEvent = asyncHandler(async (req, res) => {
  const result = await Event.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) {
    res.status(404);
    throw new Error("Event not found");
  }
  res.json({ message: "Event deleted" });
});

// @route POST /api/events/:id/vote  { optionIds: [...] }  (any logged-in user)
// Replaces the user's previous vote; an empty list withdraws it.
const vote = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) {
    res.status(404);
    throw new Error("Event not found");
  }
  if (!event.poll?.enabled) {
    res.status(400);
    throw new Error("This event has no poll");
  }
  if (!pollIsOpen(event.poll)) {
    res.status(400);
    throw new Error("Voting for this poll has closed");
  }

  const ids = [...new Set((Array.isArray(req.body.optionIds) ? req.body.optionIds : []).map(String))];
  const valid = new Set(event.poll.options.map((o) => String(o._id)));
  if (ids.some((id) => !valid.has(id))) {
    res.status(400);
    throw new Error("Unknown poll option");
  }
  if (!event.poll.allowMultiple && ids.length > 1) {
    res.status(400);
    throw new Error("This poll allows only one choice");
  }

  const me = String(req.user._id);
  event.poll.options.forEach((o) => {
    o.votes = o.votes.filter((v) => String(v) !== me);
    if (ids.includes(String(o._id))) o.votes.push(req.user._id);
  });
  event.markModified("poll");
  await event.save();
  res.json(present(event, req.user, await voterNames([event], req.user)));
});

module.exports = { getEvents, getEvent, createEvent, updateEvent, deleteEvent, vote, present, voterNames, pollIsOpen, _test: { buildEvent, present, pollIsOpen } };
