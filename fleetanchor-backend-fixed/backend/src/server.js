require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const logger = require("./config/logger");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

// Routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const vendorRoutes = require("./routes/vendors");
const vehicleRoutes = require("./routes/vehicles");
const jobRoutes = require("./routes/jobs");
const estimateRoutes = require("./routes/estimates");
const invoiceRoutes = require("./routes/invoices");
const subscriptionRoutes = require("./routes/subscriptions");
const auditRoutes = require("./routes/audit");
const analyticsRoutes = require("./routes/analytics");
const webhookRoutes = require("./routes/webhooks");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 5000;

// Security Headers
app.use(helmet());

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://anchor-fleet-pro.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in dev
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-Fingerprint"],
}));

// Paystack Webhook raw body
app.use("/api/webhooks/paystack", express.raw({ type: "application/json" }));

// Body Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compression());

// Logging
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined", {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// Rate Limit
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests." },
});
app.use("/api/", globalLimiter);

// Health Check - must respond immediately
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "FleetAnchor Pro API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/estimates", estimateRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/admin", adminRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`FleetAnchor Pro API running on port ${PORT}`);
  
  // Start cron jobs safely - dont crash if they fail
  try {
    const { startCronJobs } = require("./services/cronService");
    startCronJobs();
    logger.info("Cron jobs started");
  } catch (err) {
    logger.warn("Cron jobs failed to start (non-fatal):", err.message);
  }
});

module.exports = app;