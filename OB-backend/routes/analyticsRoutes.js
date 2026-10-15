const express = require("express");
const router = express.Router();
const c = require("../controllers/analyticsController");
const { protect, admin } = require("../middleware/authMiddleware");

// Anyone (signed in or not) — the browser reports page views and actions.
router.post("/track", c.collect);

// Admin-only reports
router.get("/summary", protect, admin, c.summary);
router.get("/events", protect, admin, c.events);
router.get("/export", protect, admin, c.exportCsv);

module.exports = router;
