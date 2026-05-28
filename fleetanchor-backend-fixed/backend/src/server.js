require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");
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

// Sync DB on startup
try {
  console.log("Running prisma db push...");
  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit", timeout: 60000 });
  console.log("Database ready!");
} catch (err) {
  console.error("DB push error (continuing):", err.message);
}

// CORS - allow all origins
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Device-Fingerprint"],
  credentials: false,
}));

app.options("*", cors());

// Paystack webhook needs raw body
app.use("/api/webhooks/paystack", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "FleetAnchor Pro API", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.json({ service: "FleetAnchor Pro API", status: "running" });
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
app.use("/api/setup", require("./routes/setup"));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FleetAnchor Pro API running on port ${PORT}`);
  try {
    const { startCronJobs } = require("./services/cronService");
    startCronJobs();
  } catch(e) {
    console.warn("Cron skipped:", e.message);
  }
});

module.exports = app;