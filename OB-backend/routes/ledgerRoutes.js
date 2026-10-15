const express = require("express");
const router = express.Router();

const {
  getLedgerEntries,
  addLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  getLedgerByDateRange
} = require("../controllers/ledgerController");

const { protect, admin } = require("../middleware/authMiddleware");
const { trackAction } = require("../services/analytics");

// View all ledger entries (any logged-in user)
router.get("/", protect, getLedgerEntries);

// View by date range
router.get("/range", protect, getLedgerByDateRange);

// Admin-only routes
router.post("/", protect, admin, trackAction("ledger_entry_added", () => undefined), addLedgerEntry);
router.put("/:id", protect, admin, trackAction("ledger_entry_updated"), updateLedgerEntry);
router.delete("/:id", protect, admin, trackAction("ledger_entry_deleted"), deleteLedgerEntry);

module.exports = router;
