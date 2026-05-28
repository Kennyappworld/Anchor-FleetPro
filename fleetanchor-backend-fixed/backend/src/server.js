require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { execSync } = require("child_process");

const logger = require("./config/logger");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

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

// Run DB sync on startup
try {
  console.log("Syncing database schema...");
  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
  console.log("Database schema synced!");
} catch (err) {
  console.error("DB push failed (non-fatal):", err.message);
}

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Device-Fingerprint"],
}));

app.use("/api/webhooks/paystack", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined", { stream: { write: (m) => logger.http(m.trim()) } }));
}

app.use("/api/", rateLimit({
  windowMs: 900000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: "Too many requests." },
}));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "FleetAnchor Pro API", timestamp: new Date().toISOString() });
});

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

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FleetAnchor Pro API running on port ${PORT}`);
  try {
    const { startCronJobs } = require("./services/cronService");
    startCronJobs();
  } catch(e) {
    console.warn("Cron jobs skipped:", e.message);
  }
});

module.exports = app;