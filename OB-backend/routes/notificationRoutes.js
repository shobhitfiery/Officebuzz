const express = require("express");
const router = express.Router();
const c = require("../controllers/notificationController");
const sched = require("../controllers/scheduleController");
const { protect, admin } = require("../middleware/authMiddleware");
const { trackAction } = require("../services/analytics");

// Any logged-in user
router.get("/", protect, c.getMine);
router.get("/unread-count", protect, c.unreadCount);
router.post("/read-all", protect, c.markAllRead);
router.get("/push/public-key", protect, c.pushKey);
router.post("/push/subscribe", protect, trackAction("push_enabled", () => undefined), c.subscribe);
router.post("/push/unsubscribe", protect, trackAction("push_disabled", () => undefined), c.unsubscribe);
router.get("/scheduled", protect, sched.list);

// Admin-only
router.get("/templates", protect, admin, c.listTemplates);
router.post("/preview", protect, admin, c.preview);
router.get("/sent", protect, admin, c.getSent);
router.get("/status", protect, admin, c.status);
router.post("/run-daily", protect, admin, c.runDaily);
router.post("/", protect, admin, trackAction("notification_sent", (req) => ({ category: req.body.type || "info", audience: req.body.audience === "selected" ? "selected" : "all" })), c.send);
router.post("/scheduled", protect, admin, trackAction("notification_scheduled", (req) => ({ category: req.body.type || "info" })), sched.create);
router.put("/scheduled/:id", protect, admin, sched.update);
router.delete("/scheduled/:id", protect, admin, sched.cancel);
router.post("/scheduled/:id/send-now", protect, admin, sched.sendNow);
router.post("/auto-skip", protect, admin, sched.autoSkip);
router.delete("/:id", protect, admin, c.remove);

router.post("/:id/read", protect, c.markRead);

module.exports = router;
