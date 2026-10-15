// models/employeeModel.js
const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Employee name is required'],
        trim: true,
    },
    // Links the employee record to a registered user (by email).
    email: {
        type: String,
        trim: true,
        lowercase: true,
    },
    birthday: { type: Date },
    anniversary: { type: Date },
    joiningDate: { type: Date },
    contactNo: {
        type: String,
        trim: true,
    },
    // Inactive employees keep all their history, but are hidden from new ledger
    // entries and from birthday/anniversary reminders. Missing = active (older records).
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

module.exports = Employee;
