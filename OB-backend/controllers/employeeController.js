const asyncHandler = require("express-async-handler");
const Employee = require("../models/employeeModel");

// @desc Get all employees
// @route GET /api/employees
// @access Private
const getEmployees = asyncHandler(async (req, res) => {
  const employees = await Employee.find().sort({ name: 1 });
  res.json(employees);
});

// @desc Get employee by ID
// @route GET /api/employees/:id
// @access Private
const getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (employee) {
    res.json(employee);
  } else {
    res.status(404);
    throw new Error("Employee not found");
  }
});

// @desc Add new employee (admin only)
// @route POST /api/employees
// @access Private/Admin
const addEmployee = asyncHandler(async (req, res) => {
  const { name, email, birthday, anniversary, joiningDate, contactNo } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("Employee name is required");
  }

  const employee = await Employee.create({
    name,
    email: email || undefined,
    birthday: birthday || undefined,
    anniversary: anniversary || undefined,
    joiningDate: joiningDate || undefined,
    contactNo: contactNo || undefined,
  });

  res.status(201).json(employee);
});

// @desc Update employee (admin only)
// @route PUT /api/employees/:id
// @access Private/Admin
const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (employee) {
    employee.name = req.body.name || employee.name;
    employee.email = req.body.email !== undefined ? req.body.email : employee.email;
    employee.birthday = req.body.birthday !== undefined ? req.body.birthday : employee.birthday;
    employee.anniversary = req.body.anniversary !== undefined ? req.body.anniversary : employee.anniversary;
    employee.joiningDate = req.body.joiningDate !== undefined ? req.body.joiningDate : employee.joiningDate;
    employee.contactNo = req.body.contactNo !== undefined ? req.body.contactNo : employee.contactNo;

    const updatedEmployee = await employee.save();
    res.json(updatedEmployee);
  } else {
    res.status(404);
    throw new Error("Employee not found");
  }
});

// @desc Delete employee (admin only)
// @route DELETE /api/employees/:id
// @access Private/Admin
const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (employee) {
    await Employee.deleteOne({ _id: req.params.id });
    res.json({ message: "Employee removed" });
  } else {
    res.status(404);
    throw new Error("Employee not found");
  }
});

// @desc Get employees with upcoming birthdays (within next 30 days)
// @route GET /api/employees/upcoming/birthdays
// @access Private
const getUpcomingBirthdays = asyncHandler(async (req, res) => {
  const employees = await Employee.find({ birthday: { $exists: true, $ne: null } });
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Normalize to midnight
  
  const upcomingEmployees = employees.filter(employee => {
    if (!employee.birthday) return false;
    
    const birthday = new Date(employee.birthday);
    let thisYearBirthday = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());
    
    // If birthday has passed this year, check next year
    if (thisYearBirthday < today) {
      thisYearBirthday = new Date(today.getFullYear() + 1, birthday.getMonth(), birthday.getDate());
    }
    
    const daysUntil = Math.round((thisYearBirthday - today) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 30;
  });
  
  res.json(upcomingEmployees);
});

// @desc Get employees with upcoming anniversaries (within next 30 days)
// @route GET /api/employees/upcoming/anniversaries
// @access Private
const getUpcomingAnniversaries = asyncHandler(async (req, res) => {
  const employees = await Employee.find({ anniversary: { $exists: true, $ne: null } });
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Normalize to midnight
  
  const upcomingEmployees = employees.filter(employee => {
    if (!employee.anniversary) return false;
    
    const anniversary = new Date(employee.anniversary);
    let thisYearAnniversary = new Date(today.getFullYear(), anniversary.getMonth(), anniversary.getDate());
    
    // If anniversary has passed this year, check next year
    if (thisYearAnniversary < today) {
      thisYearAnniversary = new Date(today.getFullYear() + 1, anniversary.getMonth(), anniversary.getDate());
    }
    
    const daysUntil = Math.round((thisYearAnniversary - today) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 30;
  });
  
  res.json(upcomingEmployees);
});

// @desc Get employees with celebrations today (birthday, anniversary, or work anniversary)
// @route GET /api/employees/today/celebrations
// @access Private
const getTodayCelebrations = asyncHandler(async (req, res) => {
  const employees = await Employee.find();
  
  const today = new Date();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();
  
  const celebrations = [];
  
  employees.forEach(employee => {
    // Check birthday
    if (employee.birthday) {
      const birthday = new Date(employee.birthday);
      if (birthday.getMonth() === todayMonth && birthday.getDate() === todayDate) {
        celebrations.push({
          name: employee.name,
          type: 'birthday',
          date: employee.birthday
        });
      }
    }
    
    // Check anniversary
    if (employee.anniversary) {
      const anniversary = new Date(employee.anniversary);
      if (anniversary.getMonth() === todayMonth && anniversary.getDate() === todayDate) {
        celebrations.push({
          name: employee.name,
          type: 'anniversary',
          date: employee.anniversary
        });
      }
    }
    
    // Check work anniversary (joining date)
    if (employee.joiningDate) {
      const joiningDate = new Date(employee.joiningDate);
      if (joiningDate.getMonth() === todayMonth && joiningDate.getDate() === todayDate) {
        const yearsWorked = today.getFullYear() - joiningDate.getFullYear();
        if (yearsWorked > 0) {
          celebrations.push({
            name: employee.name,
            type: 'work_anniversary',
            date: employee.joiningDate,
            years: yearsWorked
          });
        }
      }
    }
  });
  
  res.json(celebrations);
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
};
