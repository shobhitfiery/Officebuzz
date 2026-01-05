// server.js 

const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const ledgerRoutes = require("./routes/ledgerRoutes");
// const productRoutes = require('./routes/productRoutes');
// const orderRoutes = require('./routes/orderRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const cors = require('cors');

dotenv.config();

connectDB();

const app = express();

app.use(express.json());

app.use(cors());

app.use("/api/ledger", ledgerRoutes);

app.use('/api/users', authRoutes);
// app.use('/api/products', productRoutes);
// app.use('/api/orders', orderRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

app.listen(PORT, console.log(`Server running on port ${PORT}`));
