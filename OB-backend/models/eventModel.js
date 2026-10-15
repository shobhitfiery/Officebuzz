// models/eventModel.js
const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true, maxlength: 200 },
    // Users who picked this option.
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const pollSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    question: { type: String, trim: true, maxlength: 300 },
    options: [pollOptionSchema],
    allowMultiple: { type: Boolean, default: false },
    closesAt: { type: Date, default: null },   // optional automatic close
    closed: { type: Boolean, default: false },  // closed manually by an admin
}, { _id: false });

const eventSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'Event title is required'], trim: true, maxlength: 150 },
    startDate: { type: Date, required: [true, 'Start date is required'] },
    endDate: { type: Date, default: null },                 // multi-day events
    startTime: { type: String, trim: true, default: '' },   // "HH:MM" (24h)
    endTime: { type: String, trim: true, default: '' },
    venue: { type: String, trim: true, maxlength: 200, default: '' },
    activities: [{ type: String, trim: true, maxlength: 200 }],
    details: { type: String, trim: true, maxlength: 5000, default: '' },
    poll: { type: pollSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

module.exports = Event;
module.exports.pollSchema = pollSchema;
