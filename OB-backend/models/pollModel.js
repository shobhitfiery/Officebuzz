// models/pollModel.js — standalone team polls (event polls live on the event itself).
const mongoose = require('mongoose');
const { pollSchema } = require('./eventModel');

const standalonePollSchema = new mongoose.Schema({
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    poll: { type: pollSchema, required: true },   // same structure as event polls: question, options, votes…
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date, default: null },       // when an admin closed it
}, { timestamps: true });

module.exports = mongoose.models.Poll || mongoose.model('Poll', standalonePollSchema);
