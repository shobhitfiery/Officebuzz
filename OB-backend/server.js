// server.js
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const eventRoutes = require('./routes/eventRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const pollRoutes = require('./routes/pollRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { ensureRetention } = require('./models/analyticsEventModel');
const dailyReminders = require('./services/dailyReminders');
const scheduledSender = require('./services/scheduledSender');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

['MONGO_URI', 'JWT_SECRET'].forEach((key) => {
	if (!process.env[key]) {
		console.error(`Missing required environment variable: ${key}`);
		process.exit(1);
	}
});

connectDB().then(() => {
	ensureRetention();
	dailyReminders.start();
	scheduledSender.start();
});

const app = express();
app.disable('x-powered-by');
// Profile pictures are uploaded as base64 JSON, so that one route gets a larger limit.
const smallJson = express.json({ limit: '100kb' });
const avatarJson = express.json({ limit: '700kb' });
app.use((req, res, next) => (req.path === '/api/users/profile/avatar' ? avatarJson : smallJson)(req, res, next));

// Extra origins can be supplied as a comma-separated list in CORS_ORIGINS.
const allowedOrigins = [
	'http://localhost:3000',
	'http://localhost:3001',
	'http://localhost:3002',
	'http://127.0.0.1:3000',
	'http://127.0.0.1:3001',
	'http://127.0.0.1:3002',
	'http://10.220.84.66:5001',
	'http://10.220.84.66:3001',
	...(process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
];

const corsOptions = {
	origin: (origin, callback) => {
		// Same-origin requests and tools like curl send no Origin header.
		if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
		return callback(null, false);
	},
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/ledger', ledgerRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/users', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/analytics', analyticsRoutes);

// Unknown API routes must return JSON 404s, not the React index page.
app.use('/api', notFound);

// Serve React build
const frontendBuild = path.join(__dirname, '../officebuzz/build');
app.use(express.static(frontendBuild, { index: false, maxAge: '1h' }));
app.get('*', (req, res, next) => {
	res.sendFile(path.join(frontendBuild, 'index.html'), (err) => {
		if (err) next();
	});
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
