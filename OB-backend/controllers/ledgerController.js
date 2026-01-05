const asyncHandler = require("express-async-handler");
const Ledger = require("../models/ledgerModel");

// @desc Get all ledger entries (any logged-in user)
// @route GET /api/ledger
// @access Private
const getLedgerEntries = asyncHandler(async (req, res) => {
  const entries = await Ledger.find().sort({ timestamp: -1 });
  res.json(entries);
});

// @desc Add ledger entry (admin only)
// @route POST /api/ledger
// @access Private/Admin
const addLedgerEntry = asyncHandler(async (req, res) => {
    const { transactionAmount, employee, remarks } = req.body;
  
    if (!transactionAmount || !employee) {
      res.status(400);
      throw new Error("Transaction amount and employee are required");
    }
  
    // Convert transactionAmount to number
    const amount = Number(transactionAmount);
    if (isNaN(amount)) {
      res.status(400);
      throw new Error("Invalid transaction amount");
    }
  
    // Find last ledger entry to calculate new balance
    const lastEntry = await Ledger.findOne().sort({ timestamp: -1 });
    const newBalance = lastEntry ? lastEntry.balance + amount : amount;
  
    // Create new ledger entry
    const ledger = await Ledger.create({
      transactionAmount: amount,
      employee,
      remarks,
      balance: newBalance,  // calculated automatically
      timestamp: new Date(),
    });
  
    res.status(201).json(ledger);
  });
  

// @desc Update ledger entry (admin only)
// @route PUT /api/ledger/:id
// @access Private/Admin
const updateLedgerEntry = asyncHandler(async (req, res) => {
    const { transactionAmount, employee, remarks } = req.body;
  
    // Find the entry to update
    const entry = await Ledger.findById(req.params.id);
    if (!entry) {
      res.status(404);
      throw new Error("Ledger entry not found");
    }
  
    // Update the entry fields
    entry.transactionAmount = transactionAmount;
    entry.employee = employee;
    entry.remarks = remarks;
    await entry.save();
  
    // Recalculate balance for this and all subsequent entries
    // Find previous entry (by timestamp)
    const previousEntry = await Ledger.findOne({ timestamp: { $lt: entry.timestamp } }).sort({ timestamp: -1 });
    entry.balance = previousEntry ? previousEntry.balance + entry.transactionAmount : entry.transactionAmount;
    await entry.save();
  
    // Update subsequent entries
    const subsequentEntries = await Ledger.find({ timestamp: { $gt: entry.timestamp } }).sort({ timestamp: 1 });
    let runningBalance = entry.balance;
  
    for (const e of subsequentEntries) {
      runningBalance += e.transactionAmount;
      e.balance = runningBalance;
      await e.save();
    }
  
    res.json(entry);
  });
  

// @desc Delete ledger entry (admin only)
// @route DELETE /api/ledger/:id
// @access Private/Admin
const deleteLedgerEntry = asyncHandler(async (req, res) => {
  const entry = await Ledger.findById(req.params.id);

  if (!entry) {
    res.status(404);
    throw new Error("Ledger entry not found");
  }

  await entry.deleteOne();
  res.json({ message: "Ledger entry deleted" });
});

// @desc Get ledger entries by date range
// @route GET /api/ledger/range?start=2024-01-01&end=2024-01-31
// @access Private
const getLedgerByDateRange = asyncHandler(async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    res.status(400);
    throw new Error("Start and end dates are required");
  }

  const entries = await Ledger.find({
    timestamp: {
      $gte: new Date(start),
      $lte: new Date(end),
    },
  }).sort({ timestamp: -1 });

  res.json(entries);
});

module.exports = {
  getLedgerEntries,
  addLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  getLedgerByDateRange,
};
