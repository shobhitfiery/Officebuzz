// models/passwordResetModel.js — one-time codes for password resets (auto-deleted after expiry).
const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    codeHash: { type: String, required: true },   // bcrypt hash — the code itself is never stored
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
}, { timestamps: true });

// MongoDB removes expired codes automatically.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.PasswordReset || mongoose.model('PasswordReset', passwordResetSchema);
