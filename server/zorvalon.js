// File: zorvalon.js
// Description: Entry point for Detechify server
// Boot order: Express → Routes → Error Handling → Start Server
// Notes: Console logs mark important checkpoints for audit and debugging

const express = require('express');

// ============================================================
// STEP 1: Create Express App
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

console.log('Detechify server starting...');

// ============================================================
// STEP 2: Basic Middleware Registration
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// STEP 3: Routes
// ============================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Detechify server is running' });
});

// Hello world endpoint (as required by building laws)
app.get('/api/hello', (req, res) => {
  res.json({ message: 'hello world' });
});

// ============================================================
// STEP 4: Error Handling
// ============================================================
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================
// STEP 5: Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`Detechify server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Hello endpoint: http://localhost:${PORT}/api/hello`);
});
