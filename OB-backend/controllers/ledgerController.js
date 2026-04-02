const asyncHandler = require("express-async-handler");
const Ledger = require("../models/ledgerModel");

const parseDateInput = (value) => {
  if (!value) return null;

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  const parsed = dateOnlyPattern.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const recalculateLedgerBalances = async () => {
  const entries = await Ledger.find().sort({ depositDate: 1, timestamp: 1, createdAt: 1, _id: 1 });

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
  const entries = await Ledger.find().sort({ timestamp: -1, createdAt: -1, _id: -1 });
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

  const parsedDepositDate = parseDateInput(date);
  if (date && !parsedDepositDate) {
    res.status(400);
    throw new Error("Invalid date");
  }

  const ledger = await Ledger.create({
    transactionAmount: amount,
    employee,
    remarks,
    balance: 0,
    timestamp: new Date(),
    depositDate: parsedDepositDate,
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

  const parsedDepositDate = parseDateInput(date);
  if (date && !parsedDepositDate) {
    res.status(400);
    throw new Error("Invalid date");
  }

  entry.transactionAmount = amount;
  entry.employee = employee;
  entry.remarks = remarks;
  if (date) {
    entry.depositDate = parsedDepositDate;
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

  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error("Invalid start or end date");
  }

  const endOfDay = new Date(endDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const entries = await Ledger.find({
    depositDate: {
      $gte: startDate,
      $lte: endOfDay,
    },
  }).sort({ timestamp: -1, createdAt: -1, _id: -1 });

  res.json(entries);
});

module.exports = {
  getLedgerEntries,
  addLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  getLedgerByDateRange,
};
