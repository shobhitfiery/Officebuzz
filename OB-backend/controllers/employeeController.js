const asyncHandler = require("express-async-handler");
const Employee = require("../models/employeeModel");

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_DAYS = 30;
const DATE_FIELDS = ["birthday", "anniversary", "joiningDate"];
// Records created before the isActive field existed have no value and count as active.
const ACTIVE = { isActive: { $ne: false } };

// Dates are saved from <input type="date"> values ("YYYY-MM-DD"), i.e. UTC midnight, but
// older records may hold a local midnight (e.g. 18:30Z for IST). Snapping to the nearest
// UTC midnight gives the intended calendar day either way, independent of server time zone.
const monthDay = (value) => {
  const raw = new Date(value);
  const d = new Date(raw.getTime() + 12 * 60 * 60 * 1000);
  return Number.isNaN(d.getTime()) ? null : { month: d.getUTCMonth(), day: d.getUTCDate(), year: d.getUTCFullYear() };
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// Feb 29 dates fall on Feb 28 in non-leap years.
const occurrenceIn = (year, md) => {
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const day = md.month === 1 && md.day === 29 && !isLeap(year) ? 28 : md.day;
  return new Date(year, md.month, day);
};

const daysUntilNext = (value, today = startOfToday()) => {
  const md = monthDay(value);
  if (!md) return null;
  let next = occurrenceIn(today.getFullYear(), md);
  if (next < today) next = occurrenceIn(today.getFullYear() + 1, md);
  return Math.round((next - today) / DAY_MS);
};

// Accept "", null -> clear the field; valid date string -> Date; anything else -> error.
const parseOptionalDate = (value, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error(`Invalid ${field}`);
    err.status = 400;
    throw err;
  }
  return d;
};

const cleanString = (value) => (typeof value === "string" ? value.trim() : value);

// @route GET /api/employees
const getEmployees = asyncHandler(async (req, res) => {
  const employees = await Employee.find().sort({ name: 1 });
  res.json(employees);
});

// @route GET /api/employees/:id
const getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }
  res.json(employee);
});

// @route POST /api/employees  (admin)
const addEmployee = asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name);
  if (!name) {
    res.status(400);
    throw new Error("Employee name is required");
  }

  const data = { name };
  try {
    DATE_FIELDS.forEach((f) => {
      const v = parseOptionalDate(req.body[f], f);
      if (v) data[f] = v;
    });
  } catch (e) {
    res.status(e.status || 400);
    throw e;
  }
  if (cleanString(req.body.email)) data.email = cleanString(req.body.email);
  if (cleanString(req.body.contactNo)) data.contactNo = cleanString(req.body.contactNo);
  if (typeof req.body.isActive === "boolean") data.isActive = req.body.isActive;

  const employee = await Employee.create(data);
  res.status(201).json(employee);
});

// @route PUT /api/employees/:id  (admin, or the user linked to this record)
const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }

  const isAdmin = !!req.user.isAdmin;
  const isOwner =
    !!employee.email && employee.email.toLowerCase() === String(req.user.email || "").toLowerCase();

  if (!isAdmin && !isOwner) {
    res.status(403);
    throw new Error("You can only update your own details");
  }

  // Only admins may change the name or the linked user.
  if (isAdmin) {
    const name = cleanString(req.body.name);
    if (name) employee.name = name;
    if (req.body.email !== undefined) employee.email = cleanString(req.body.email) || undefined;
    if (typeof req.body.isActive === "boolean") employee.isActive = req.body.isActive;
  }

  try {
    DATE_FIELDS.forEach((f) => {
      const v = parseOptionalDate(req.body[f], f);
      if (v !== undefined) employee[f] = v;
    });
  } catch (e) {
    res.status(e.status || 400);
    throw e;
  }
  if (req.body.contactNo !== undefined) employee.contactNo = cleanString(req.body.contactNo) || undefined;

  const updatedEmployee = await employee.save();
  res.json(updatedEmployee);
});

// @route DELETE /api/employees/:id  (admin)
const deleteEmployee = asyncHandler(async (req, res) => {
  const result = await Employee.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) {
    res.status(404);
    throw new Error("Employee not found");
  }
  res.json({ message: "Employee removed" });
});

const upcomingBy = (field) =>
  asyncHandler(async (req, res) => {
    const employees = await Employee.find({ [field]: { $ne: null }, ...ACTIVE }).lean();
    const today = startOfToday();

    const upcoming = employees
      .map((e) => ({ ...e, daysUntil: daysUntilNext(e[field], today) }))
      .filter((e) => e.daysUntil !== null && e.daysUntil <= UPCOMING_WINDOW_DAYS)
      .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));

    res.json(upcoming);
  });

// @route GET /api/employees/upcoming/birthdays
const getUpcomingBirthdays = upcomingBy("birthday");
// @route GET /api/employees/upcoming/anniversaries
// Marriage anniversaries AND work (joining-date) anniversaries in the next 30 days.
// Each item: { _id, employeeId, name, kind: 'anniversary' | 'work_anniversary', date, years, daysUntil }
// (years = the number being completed; null when the original year isn't meaningful).
const getUpcomingAnniversaries = asyncHandler(async (req, res) => {
  const employees = await Employee.find({
    ...ACTIVE,
    $or: [{ anniversary: { $ne: null } }, { joiningDate: { $ne: null } }],
  }).lean();
  const today = startOfToday();
  const items = [];
  employees.forEach((e) => {
    [
      ["anniversary", "anniversary"],
      ["joiningDate", "work_anniversary"],
    ].forEach(([field, kind]) => {
      if (!e[field]) return;
      const days = daysUntilNext(e[field], today);
      if (days === null || days > UPCOMING_WINDOW_DAYS) return;
      const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
      const years = next.getFullYear() - monthDay(e[field]).year;
      if (kind === "work_anniversary" && years < 1) return; // joined this year — nothing to celebrate yet
      items.push({
        _id: `${e._id}:${kind}`,
        employeeId: e._id,
        name: e.name,
        email: e.email || "",
        kind,
        date: e[field],
        [field]: e[field],
        years: years > 0 ? years : null,
        daysUntil: days,
      });
    });
  });
  items.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  res.json(items);
});

// Birthdays, anniversaries and work anniversaries falling on `day` (a local-midnight Date),
// from an already-loaded list of employees.
const celebrationsForDay = (employees, day) => {
  const celebrations = [];
  employees.forEach((employee) => {
    if (employee.isActive === false) return;
    if (employee.birthday && daysUntilNext(employee.birthday, day) === 0) {
      celebrations.push({ name: employee.name, email: employee.email, type: "birthday", date: employee.birthday });
    }
    if (employee.anniversary && daysUntilNext(employee.anniversary, day) === 0) {
      celebrations.push({ name: employee.name, email: employee.email, type: "anniversary", date: employee.anniversary });
    }
    if (employee.joiningDate && daysUntilNext(employee.joiningDate, day) === 0) {
      const years = day.getFullYear() - monthDay(employee.joiningDate).year;
      if (years > 0) {
        celebrations.push({ name: employee.name, email: employee.email, type: "work_anniversary", date: employee.joiningDate, years });
      }
    }
  });
  return celebrations;
};

// Today's celebrations (active employees only). Shared by the API below and the daily reminder job.
const findTodayCelebrations = async () => celebrationsForDay(await Employee.find(ACTIVE).lean(), startOfToday());

// @route GET /api/employees/today/celebrations
const getTodayCelebrations = asyncHandler(async (req, res) => {
  const celebrations = await findTodayCelebrations();
  res.json(celebrations.map(({ email, ...c }) => c));
});

module.exports = {
  getEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
  getTodayCelebrations,
  findTodayCelebrations,
  celebrationsForDay,
};
