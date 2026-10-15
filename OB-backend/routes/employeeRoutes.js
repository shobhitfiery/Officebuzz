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
  getTodayCelebrations,
} = require("../controllers/employeeController");

const { protect, admin } = require("../middleware/authMiddleware");
const { trackAction } = require("../services/analytics");

// Any logged-in user
router.get("/upcoming/birthdays", protect, getUpcomingBirthdays);
router.get("/upcoming/anniversaries", protect, getUpcomingAnniversaries);
router.get("/today/celebrations", protect, getTodayCelebrations);
router.get("/", protect, getEmployees);
router.get("/:id", protect, getEmployeeById);

// Admins can edit anyone; other users can only edit their own linked record
// (ownership is enforced inside the controller).
router.put("/:id", protect, trackAction("employee_updated"), updateEmployee);

// Admin-only
router.post("/", protect, admin, trackAction("employee_added", () => undefined), addEmployee);
router.delete("/:id", protect, admin, trackAction("employee_deleted"), deleteEmployee);

module.exports = router;
