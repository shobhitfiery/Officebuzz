const express = require("express");
const router = express.Router();
const c = require("../controllers/pollController");
const { protect, admin } = require("../middleware/authMiddleware");
const { trackAction } = require("../services/analytics");

// Any logged-in user
router.get("/", protect, c.list);
router.post("/:id/vote", protect, trackAction("poll_voted"), c.vote);

// Admin-only
router.post("/", protect, admin, trackAction("poll_created", () => undefined), c.create);
router.put("/:id", protect, admin, c.update);
router.post("/:id/close", protect, admin, c.setClosed);
router.delete("/:id", protect, admin, trackAction("poll_deleted"), c.remove);

module.exports = router;
