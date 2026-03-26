// server.js 

const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const ledgerRoutes = require("./routes/ledgerRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const { resetUserPassword } = require('./controllers/authController');
const { protect, admin } = require('./middleware/authMiddleware');
// const productRoutes = require('./routes/productRoutes');
// const orderRoutes = require('./routes/orderRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const cors = require('cors');

dotenv.config();

connectDB();

const app = express();

app.use(express.json());

const allowedOrigins = [
	'http://localhost:3000',
	'http://localhost:3001',
	'http://localhost:3002',
	'http://127.0.0.1:3000',
	'http://127.0.0.1:3001',
	'http://127.0.0.1:3002',
	'http://10.220.84.66:5001',
	'http://10.220.84.66:3001',
];

app.use(cors({
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.includes(origin)) {
			return callback(null, true);
		}
		return callback(new Error('Not allowed by CORS'));
	},
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

app.use("/api/ledger", ledgerRoutes);
app.use("/api/employees", employeeRoutes);

app.use('/api/users', authRoutes);
app.put('/api/users/:id/reset-password', protect, admin, resetUserPassword);
app.post('/api/users/:id/reset-password', protect, admin, resetUserPassword);
app.put('/api/users/reset-password/:id', protect, admin, resetUserPassword);
app.post('/api/users/reset-password/:id', protect, admin, resetUserPassword);
// app.use('/api/products', productRoutes);
// app.use('/api/orders', orderRoutes);

// Serve React build
const frontendBuild = path.join(__dirname, '../officebuzz/build');
app.use(express.static(frontendBuild));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuild, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

app.listen(PORT, console.log(`Server running on port ${PORT}`));
