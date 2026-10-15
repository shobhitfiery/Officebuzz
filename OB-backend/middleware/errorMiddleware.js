// middleware/errorMiddleware.js
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    let message = err.message;

    if (err.name === 'CastError') {
        statusCode = 404;
        message = 'Resource not found';
    } else if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map((e) => e.message).join(', ');
    } else if (err.code === 11000) {
        statusCode = 400;
        message = 'A record with these details already exists';
    } else if (err.type === 'entity.parse.failed') {
        statusCode = 400;
        message = 'Malformed JSON body';
    }

    if (statusCode >= 500) console.error(err);

    res.status(statusCode).json({
        message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = { notFound, errorHandler };
