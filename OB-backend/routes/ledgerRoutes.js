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

// View all ledger entries (any logged-in user)
router.get("/", protect, getLedgerEntries);

// View by date range
router.get("/range", protect, getLedgerByDateRange);

// Admin-only routes
router.post("/", protect, admin, addLedgerEntry);
router.put("/:id", protect, admin, updateLedgerEntry);
router.delete("/:id", protect, admin, deleteLedgerEntry);

module.exports = router;
