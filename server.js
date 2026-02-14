import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║                                        ║
  ║     🚀 TheParchi Backend Running      ║
  ║                                        ║
  ║     Environment: ${process.env.NODE_ENV || 'development'}               ║
  ║     Port: ${PORT}                          ║
  ║                                        ║
  ╚════════════════════════════════════════╝
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log(`❌ Error: ${err.message}`);
  server.close(() => process.exit(1));
});
