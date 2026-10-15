// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');

const protect = asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
        res.status(401);
        throw new Error('Not authorized, no token');
    }

    let decoded;
    try {
        decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch (error) {
        res.status(401);
        throw new Error('Not authorized, token failed');
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
        // Token is valid but the account was deleted.
        res.status(401);
        throw new Error('Not authorized, user no longer exists');
    }

    req.user = user;
    next();
});

const admin = (req, res, next) => {
    if (req.user && req.user.isAdmin) return next();
    res.status(403);
    throw new Error('Not authorized as an admin');
};

module.exports = { protect, admin };
