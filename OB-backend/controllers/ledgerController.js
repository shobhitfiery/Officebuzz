const asyncHandler = require("express-async-handler");
const Ledger = require("../models/ledgerModel");
const Employee = require("../models/employeeModel");

const parseDateInput = (value) => {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Today's calendar date (server local time) as YYYY-MM-DD.
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The date an entry "happened": its deposit date, or creation time for old entries without one.
const effectiveDate = (e) => new Date(e.depositDate || e.timestamp || e.createdAt || 0).getTime();

// Chronological order used both for running balances and (reversed) for display,
// so the balance column always reads correctly top-to-bottom.
const chronological = (a, b) =>
  effectiveDate(a) - effectiveDate(b) ||
  new Date(a.timestamp) - new Date(b.timestamp) ||
  new Date(a.createdAt) - new Date(b.createdAt) ||
  String(a._id).localeCompare(String(b._id));

const recalculateLedgerBalances = async () => {
  const entries = (await Ledger.find().lean()).sort(chronological);

  let runningBalance = 0;
  const operations = [];
  entries.forEach((entry) => {
    runningBalance += Number(entry.transactionAmount) || 0;
    // Round to paise to avoid floating point drift (e.g. 0.1 + 0.2).
    runningBalance = Math.round(runningBalance * 100) / 100;
    if (entry.balance !== runningBalance) {
      operations.push({
        updateOne: { filter: { _id: entry._id }, update: { $set: { balance: runningBalance } } },
      });
    }
  });

  if (operations.length > 0) await Ledger.bulkWrite(operations);
};

const validateBody = (req, res, { partial = false } = {}) => {
  const { transactionAmount, employee, remarks, date } = req.body;

  if (!partial && (transactionAmount === undefined || transactionAmount === null || transactionAmount === "" || !employee)) {
    res.status(400);
    throw new Error("Transaction amount and employee are required");
  }

  const result = {};
  if (transactionAmount !== undefined) {
    const amount = Number(transactionAmount);
    if (transactionAmount === "" || !Number.isFinite(amount)) {
      res.status(400);
      throw new Error("Invalid transaction amount");
    }
    result.transactionAmount = Math.round(amount * 100) / 100;
  }
  if (employee !== undefined) {
    if (!String(employee).trim()) {
      res.status(400);
      throw new Error("Employee is required");
    }
    result.employee = String(employee).trim();
  }
  if (remarks !== undefined) result.remarks = String(remarks || "").trim();
  if (date) {
    const parsed = parseDateInput(date);
    if (!parsed) {
      res.status(400);
      throw new Error("Invalid date");
    }
    result.depositDate = parsed;
  }
  return result;
};

// @route GET /api/ledger  (any logged-in user) — newest first
const getLedgerEntries = asyncHandler(async (req, res) => {
  const entries = (await Ledger.find().lean()).sort(chronological).reverse();
  res.json(entries);
});

// @route POST /api/ledger  (admin)
const addLedgerEntry = asyncHandler(async (req, res) => {
  const data = validateBody(req, res);

  // New transactions can't be recorded against an inactive employee (history stays untouched).
  const inactive = await Employee.findOne({ name: data.employee, isActive: false }).lean();
  if (inactive) {
    res.status(400);
    throw new Error(`${data.employee} is inactive. Reactivate them on the Employees page to add new entries.`);
  }

  const ledger = await Ledger.create({
    ...data,
    balance: 0,
    timestamp: new Date(),
    depositDate: data.depositDate || parseDateInput(todayISO()),
  });

  await recalculateLedgerBalances();
  res.status(201).json(await Ledger.findById(ledger._id));
});

// @route PUT /api/ledger/:id  (admin)
const updateLedgerEntry = asyncHandler(async (req, res) => {
  const entry = await Ledger.findById(req.params.id);
  if (!entry) {
    res.status(404);
    throw new Error("Ledger entry not found");
  }

  Object.assign(entry, validateBody(req, res, { partial: true }));
  await entry.save();

  await recalculateLedgerBalances();
  res.json(await Ledger.findById(entry._id));
});

// @route DELETE /api/ledger/:id  (admin)
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

// @route GET /api/ledger/range?start=YYYY-MM-DD&end=YYYY-MM-DD  (any logged-in user)
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
  if (startDate > endDate) {
    res.status(400);
    throw new Error("Start date must be on or before end date");
  }

  const endOfDay = new Date(endDate);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const inRange = { $gte: startDate, $lte: endOfDay };

  // Older entries have no depositDate; fall back to when they were recorded.
  const entries = await Ledger.find({
    $or: [
      { depositDate: inRange },
      { depositDate: null, timestamp: inRange },
    ],
  }).lean();

  res.json(entries.sort(chronological).reverse());
});

module.exports = {
  getLedgerEntries,
  addLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  getLedgerByDateRange,
};
