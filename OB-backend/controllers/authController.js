// controllers/authController.js
const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PasswordReset = require('../models/passwordResetModel');
const Employee = require('../models/employeeModel');
const mailer = require('../services/mailer');
const Avatar = require('../models/avatarModel');
const { track } = require('../services/analytics');

const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'fiery.com').toLowerCase();
const MIN_PASSWORD_LENGTH = 6;

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive lookup so accounts created before emails were lower-cased still match.
const findByEmail = (email) => User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });

const userPayload = (user, withToken = false) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    avatarVersion: user.avatarVersion || 0,
    mustChangePassword: !!user.mustChangePassword,
    ...(withToken ? { token: generateToken(user._id) } : {}),
});

// @route POST /api/users  (admin) — also POST /api/users/register (admin-only now)
// { name, email, password, isAdmin, addToDirectory, sendWelcome }
const registerUser = asyncHandler(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Name, email and password are required');
    }
    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
        res.status(400);
        throw new Error(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses can register`);
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        res.status(400);
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    }

    if (await findByEmail(email)) {
        res.status(400);
        throw new Error('User already exists');
    }

    const user = await User.create({ name, email, password, isAdmin: req.body.isAdmin === true, mustChangePassword: true });

    // Optionally add them to the employee directory (if not already there).
    let addedToDirectory = false;
    if (req.body.addToDirectory !== false) {
        const exists = await Employee.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') }).lean();
        if (!exists) {
            await Employee.create({ name, email });
            addedToDirectory = true;
        }
    }

    let welcomeSent = false;
    let welcomeError = null;
    if (req.body.sendWelcome) {
        try {
            await mailer.sendWelcome(email, name);
            welcomeSent = true;
        } catch (e) {
            welcomeError = e.message;
        }
    }

    res.status(201).json({ ...userPayload(user), addedToDirectory, welcomeSent, welcomeError });
});

// ---------- Password reset with an emailed one-time code ----------
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_PER_HOUR = 5;
const IP_PER_HOUR = 20;
const ipHits = new Map(); // ip -> [timestamps]

const tooManyFromIp = (ip) => {
    const now = Date.now();
    const hits = (ipHits.get(ip) || []).filter((t) => now - t < 3600e3);
    hits.push(now);
    ipHits.set(ip, hits);
    if (ipHits.size > 5000) ipHits.clear();
    return hits.length > IP_PER_HOUR;
};

const GENERIC_SENT = 'If an account exists for that email, a 6-digit code is on its way. It expires in 10 minutes.';

// @route POST /api/users/forgot-password  { email }  (public)
// Always answers the same way, so it can't be used to discover which emails have accounts.
const forgotPassword = asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400);
        throw new Error('Enter a valid email address');
    }
    if (tooManyFromIp(req.ip)) {
        res.status(429);
        throw new Error('Too many requests. Please try again in an hour.');
    }

    const user = await findByEmail(email);
    if (!user) return res.json({ message: GENERIC_SENT, resendIn: OTP_RESEND_SECONDS });

    const recent = await PasswordReset.find({ user: user._id, createdAt: { $gt: new Date(Date.now() - 3600e3) } }).sort({ createdAt: -1 }).lean();
    if (recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < OTP_RESEND_SECONDS * 1000) {
        const wait = Math.ceil((OTP_RESEND_SECONDS * 1000 - (Date.now() - new Date(recent[0].createdAt).getTime())) / 1000);
        res.status(429);
        throw new Error(`Please wait ${wait} seconds before asking for a new code.`);
    }
    if (recent.length >= OTP_PER_HOUR) {
        res.status(429);
        throw new Error('Too many codes requested. Please try again in an hour.');
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    // Only the newest code is valid.
    await PasswordReset.updateMany({ user: user._id, usedAt: null }, { $set: { usedAt: new Date() } });
    await PasswordReset.create({
        user: user._id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + OTP_MINUTES * 60 * 1000),
    });

    try {
        await mailer.sendOtp(user.email, user.name, code, OTP_MINUTES);
    } catch (e) {
        console.error('Password reset email failed:', e.message);
        res.status(502);
        throw new Error("We couldn't send the email right now. Please try again in a few minutes or ask an admin.");
    }
    res.json({ message: GENERIC_SENT, resendIn: OTP_RESEND_SECONDS });
});

// @route POST /api/users/reset-password  { email, otp, password }  (public)
const resetPasswordWithOtp = asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').replace(/\D/g, '');
    const { password } = req.body;

    if (!email || otp.length !== 6) {
        res.status(400);
        throw new Error('Enter the 6-digit code from the email');
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        res.status(400);
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    }

    const invalid = () => {
        res.status(400);
        throw new Error('That code is invalid or has expired. Request a new one.');
    };
    const user = await findByEmail(email);
    if (!user) invalid();

    const record = await PasswordReset.findOne({ user: user._id, usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!record || record.attempts >= OTP_MAX_ATTEMPTS) invalid();

    if (!(await bcrypt.compare(otp, record.codeHash))) {
        record.attempts += 1;
        await record.save();
        const left = OTP_MAX_ATTEMPTS - record.attempts;
        res.status(400);
        throw new Error(left > 0 ? `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong attempts. Request a new code.');
    }

    if (user.mustChangePassword && (await user.matchPassword(password))) {
        res.status(400);
        throw new Error('Choose a new password — not the temporary one you were given.');
    }

    record.usedAt = new Date();
    await record.save();
    await PasswordReset.updateMany({ user: user._id, usedAt: null }, { $set: { usedAt: new Date() } });

    user.password = password;
    user.mustChangePassword = false;
    await user.save();
    res.json({ message: 'Password updated. You can now sign in with your new password.', email: user.email });
});

// @route POST /api/users/login  (public)
const authUser = asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
        res.status(400);
        throw new Error('Email and password are required');
    }

    const user = await findByEmail(email);
    if (user && (await user.matchPassword(password))) {
        track('login', req, { user: user._id });
        return res.json(userPayload(user, true));
    }
    track('login_failed', req, { user: user ? user._id : null, meta: user ? undefined : { unknownEmail: true } });

    res.status(401);
    throw new Error('Invalid email or password');
});

// The directory record linked to an account (matched by email, case-insensitive).
const findLinkedEmployee = (email) =>
    email ? Employee.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') }) : null;

const employeePayload = (e) =>
    e ? {
        _id: e._id,
        name: e.name,
        birthday: e.birthday || null,
        anniversary: e.anniversary || null,
        joiningDate: e.joiningDate || null,
        contactNo: e.contactNo || '',
        isActive: e.isActive !== false,
    } : null;

// "" / null clears a date; a valid date string sets it; anything else is a 400.
const parseProfileDate = (value, label) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        const err = new Error(`${label} isn't a valid date`);
        err.status = 400;
        throw err;
    }
    if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000 && label !== 'Joining date') {
        const err = new Error(`${label} can't be in the future`);
        err.status = 400;
        throw err;
    }
    return d;
};

// @route GET /api/users/profile  (private)
const getUserProfile = asyncHandler(async (req, res) => {
    const employee = await findLinkedEmployee(req.user.email);
    res.json({ ...userPayload(req.user), employee: employeePayload(employee) });
});

// @route PUT /api/users/profile  (private) — edit your own profile.
// { name, birthday, anniversary, joiningDate, contactNo }
// The account display name is yours to change. The directory name stays admin-managed,
// because ledger entries reference employees by that name.
const updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        res.status(404);
        throw new Error('Account not found');
    }

    if (req.body.name !== undefined) {
        const name = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
        if (!name) {
            res.status(400);
            throw new Error('Name can\'t be empty');
        }
        if (name.length > 60) {
            res.status(400);
            throw new Error('Name must be 60 characters or fewer');
        }
        user.name = name;
    }

    const employee = await findLinkedEmployee(user.email);
    if (employee) {
        try {
            [['birthday', 'Birthday'], ['anniversary', 'Anniversary'], ['joiningDate', 'Joining date']].forEach(([f, label]) => {
                const v = parseProfileDate(req.body[f], label);
                if (v !== undefined) employee[f] = v;
            });
        } catch (e) {
            res.status(e.status || 400);
            throw e;
        }
        if (req.body.contactNo !== undefined) {
            const c = typeof req.body.contactNo === 'string' ? req.body.contactNo.trim() : '';
            if (c && !/^[+\d][\d\s()-]{5,19}$/.test(c)) {
                res.status(400);
                throw new Error('Enter a valid phone number');
            }
            employee.contactNo = c || undefined;
        }
    }

    await user.save();
    if (employee) await employee.save();
    res.json({ ...userPayload(user), employee: employeePayload(employee) });
});

// @route GET /api/users  (admin)
const getAllUsers = asyncHandler(async (req, res) => {
    const users = await User.find({}).select('-password').sort({ name: 1 });
    res.json(users);
});

// @route PUT /api/users/:id/reset-password  (admin)
const resetUserPassword = asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (typeof password !== 'string' || password.trim().length < MIN_PASSWORD_LENGTH) {
        res.status(400);
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    }

    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    user.password = password;
    user.mustChangePassword = true; // a password an admin knows is temporary
    await user.save();

    res.json({ message: 'Password reset successfully', userId: user._id, email: user.email });
});

// @route DELETE /api/users/:id  (admin)
const deleteUser = asyncHandler(async (req, res) => {
    if (String(req.user._id) === String(req.params.id)) {
        res.status(400);
        throw new Error('You cannot delete your own account');
    }

    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    await user.deleteOne();
    await Avatar.deleteOne({ user: user._id }).catch(() => {});
    res.json({ message: 'User removed successfully' });
});

// ---------- Profile pictures ----------
const AVATAR_MAX_BYTES = 400 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAGIC = {
    'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
};

// @route PUT /api/users/profile/avatar  (private) — { image: "data:image/jpeg;base64,…" }
// The browser crops/resizes to a 256×256 image before uploading.
const uploadAvatar = asyncHandler(async (req, res) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(req.body.image || ''));
    if (!m || !AVATAR_TYPES.includes(m[1])) {
        res.status(400);
        throw new Error('Upload a JPG, PNG or WebP image');
    }
    const data = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
    if (!data.length || !MAGIC[m[1]](data)) {
        res.status(400);
        throw new Error("That file doesn't look like a valid image");
    }
    if (data.length > AVATAR_MAX_BYTES) {
        res.status(413);
        throw new Error('The picture is too large (max 400 KB after resizing)');
    }
    await Avatar.findOneAndUpdate({ user: req.user._id }, { mime: m[1], data }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const user = await User.findByIdAndUpdate(req.user._id, { avatarVersion: Date.now() }, { new: true });
    res.json(userPayload(user));
});

// @route DELETE /api/users/profile/avatar  (private)
const deleteAvatar = asyncHandler(async (req, res) => {
    await Avatar.deleteOne({ user: req.user._id });
    const user = await User.findByIdAndUpdate(req.user._id, { avatarVersion: 0 }, { new: true });
    res.json(userPayload(user));
});

// @route GET /api/users/avatar/:id  (public, so <img> tags can load it; ids aren't guessable)
const getAvatar = asyncHandler(async (req, res) => {
    if (!/^[0-9a-f]{24}$/i.test(req.params.id)) {
        res.status(404);
        throw new Error('Not found');
    }
    const a = await Avatar.findOne({ user: req.params.id }); // not lean: mongoose hands back a real Buffer
    if (!a) {
        res.status(404);
        throw new Error('No picture');
    }
    res.set('Content-Type', a.mime);
    res.set('X-Content-Type-Options', 'nosniff');
    // URLs carry ?v=<avatarVersion>, so a changed picture gets a new URL.
    res.set('Cache-Control', req.query.v ? 'private, max-age=31536000, immutable' : 'private, max-age=300');
    res.send(Buffer.isBuffer(a.data) ? a.data : Buffer.from(a.data));
});

// @route GET /api/users/avatars  (private) — who has a picture, keyed so the UI can match
// by account email, account name or employee-directory name.
const listAvatars = asyncHandler(async (req, res) => {
    const users = await User.find({ avatarVersion: { $gt: 0 } }).select('name email avatarVersion').lean();
    const emails = users.map((u) => String(u.email).toLowerCase());
    const employees = emails.length ? await Employee.find({ email: { $in: emails } }).select('name email').lean() : [];
    const empName = new Map(employees.map((e) => [String(e.email).toLowerCase(), e.name]));
    res.json(users.map((u) => ({
        userId: u._id,
        email: String(u.email).toLowerCase(),
        names: [...new Set([u.name, empName.get(String(u.email).toLowerCase())].filter(Boolean))],
        v: u.avatarVersion,
    })));
});

// Give every non-admin account the same temporary password (used by the "Account setup" email).
// Returns how many accounts were changed. Admin passwords are never touched.
const resetMemberPasswords = async (password) => {
    if (typeof password !== 'string' || password.trim().length < MIN_PASSWORD_LENGTH) {
        const err = new Error(`The temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        err.status = 400;
        throw err;
    }
    const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const r = await User.updateMany({ isAdmin: { $ne: true } }, { $set: { password: hash, mustChangePassword: true } });
    return r.modifiedCount ?? r.nModified ?? 0;
};

module.exports = {
    resetMemberPasswords,
    uploadAvatar, deleteAvatar, getAvatar, listAvatars, registerUser, authUser, getUserProfile, updateUserProfile, getAllUsers, resetUserPassword, deleteUser, forgotPassword, resetPasswordWithOtp };
