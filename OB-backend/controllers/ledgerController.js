const asyncHandler = require("express-async-handler");
const Ledger = require("../models/ledgerModel");

const recalculateLedgerBalances = async () => {
  const entries = await Ledger.find().sort({ timestamp: 1, createdAt: 1, _id: 1 });

  let runningBalance = 0;
  const operations = entries.map((entry) => {
    runningBalance += Number(entry.transactionAmount) || 0;
    return {
      updateOne: {
        filter: { _id: entry._id },
        update: { $set: { balance: runningBalance } },
      },
    };
  });

  if (operations.length > 0) {
    await Ledger.bulkWrite(operations);
  }
};

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
  const { transactionAmount, employee, remarks, date } = req.body;

  if (transactionAmount === undefined || transactionAmount === null || !employee) {
    res.status(400);
    throw new Error("Transaction amount and employee are required");
  }

  const amount = Number(transactionAmount);
  if (isNaN(amount)) {
    res.status(400);
    throw new Error("Invalid transaction amount");
  }

  const ledger = await Ledger.create({
    transactionAmount: amount,
    employee,
    remarks,
    balance: 0,
    timestamp: date ? new Date(date) : new Date(),
    depositDate: date ? new Date(date) : new Date(),
  });

  await recalculateLedgerBalances();
  const updatedLedger = await Ledger.findById(ledger._id);

  res.status(201).json(updatedLedger);
});
  

// @desc Update ledger entry (admin only)
// @route PUT /api/ledger/:id
// @access Private/Admin
const updateLedgerEntry = asyncHandler(async (req, res) => {
  const { transactionAmount, employee, remarks, date } = req.body;

  const entry = await Ledger.findById(req.params.id);
  if (!entry) {
    res.status(404);
    throw new Error("Ledger entry not found");
  }

  const amount = Number(transactionAmount);
  if (isNaN(amount)) {
    res.status(400);
    throw new Error("Invalid transaction amount");
  }

  entry.transactionAmount = amount;
  entry.employee = employee;
  entry.remarks = remarks;
  if (date) {
    entry.timestamp = new Date(date);
    entry.depositDate = new Date(date);
  }
  await entry.save();

  await recalculateLedgerBalances();
  const updatedEntry = await Ledger.findById(entry._id);

  res.json(updatedEntry);
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
  await recalculateLedgerBalances();
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
