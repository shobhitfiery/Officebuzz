// models/employeeModel.js

const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Employee name is required'],
        trim: true,
    },
    email: {
        type: String,
        ref: 'User',
        required: false,
        trim: true,
        lowercase: true,
    },
    birthday: {
        type: Date,
        required: false,
    },
    anniversary: {
        type: Date,
        required: false,
    },
    joiningDate: {
        type: Date,
        required: false,
    },
    contactNo: {
        type: String,
        required: false,
        trim: true,
    },
}, {
    timestamps: true,
});

// ✅ This prevents re-compilation
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

module.exports = Employee;
