const express = require("express");
const router = express.Router();

const {
  getEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
} = require("../controllers/employeeController");

const { protect, admin } = require("../middleware/authMiddleware");

// Get upcoming birthdays and anniversaries (any logged-in user)
router.get("/upcoming/birthdays", protect, getUpcomingBirthdays);
router.get("/upcoming/anniversaries", protect, getUpcomingAnniversaries);
// router.get("/upcoming/workanniversaries", protect, getUpcomingWorkAnniversaries);

// View all employees and individual employee (any logged-in user)
router.get("/", protect, getEmployees);
router.get("/:id", protect, getEmployeeById);

// Admin-only routes
router.post("/", protect, admin, addEmployee);
router.put("/:id", protect, updateEmployee);
router.delete("/:id", protect, admin, deleteEmployee);

module.exports = router;
