const express = require("express");
const router = express.Router();
const { getEvents, getEvent, createEvent, updateEvent, deleteEvent, vote } = require("../controllers/eventController");
const { protect, admin } = require("../middleware/authMiddleware");
const { trackAction } = require("../services/analytics");

// Any logged-in user
router.get("/", protect, getEvents);
router.get("/:id", protect, getEvent);
router.post("/:id/vote", protect, trackAction("event_poll_voted"), vote);

// Admin-only
router.post("/", protect, admin, trackAction("event_created", () => undefined), createEvent);
router.put("/:id", protect, admin, trackAction("event_updated"), updateEvent);
router.delete("/:id", protect, admin, trackAction("event_deleted"), deleteEvent);

module.exports = router;
