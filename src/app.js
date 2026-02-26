const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const routes = require("./routes");
const { createIndex } = require("./services/elastic.service");
const { startWorker } = require("./services/queue.service");

const app = express();

// Initialize Elasticsearch Index and Queue Worker
createIndex();
startWorker();

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Body parsers
// - Parse JSON request bodies
app.use(express.json());
// - Parse URL-encoded request bodies (e.g., HTML form posts)
app.use(express.urlencoded({ extended: true }));

// Register all application routes under /v1
app.use("/v1", routes);

/**
 * Health check endpoint
 * Method: GET /healthz
 * Returns a simple JSON payload with uptime and timestamp.
 */
app.get("/healthz", (_req, res) => {
  res.status(200).json({
    message: "OK!",
    date: new Date(),
    uptime: process.uptime(),
  });
});

module.exports = app;
