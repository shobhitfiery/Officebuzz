// models/avatarModel.js — profile pictures, kept out of the User document so user lists stay small.
const mongoose = require('mongoose');

const avatarSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    mime: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    data: { type: Buffer, required: true },
}, { timestamps: true });

module.exports = mongoose.models.Avatar || mongoose.model('Avatar', avatarSchema);
