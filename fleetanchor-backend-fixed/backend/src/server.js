require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");


const logger = require("./config/logger");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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
app.disable("x-powered-by"); // hide Express fingerprint
const PORT = process.env.PORT || 5000;


// ── Security headers (helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // API only — no HTML served
  crossOriginEmbedderPolicy: false,
}));
app.set("trust proxy", 1); // trust Railway/Vercel reverse proxy for real IP

// ── Global API rate limiter — 200 req/15min per IP ───────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please slow down." },
  skip: (req) => req.path === "/health", // never throttle health checks
});
app.use("/api/", globalLimiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://anchor-fleet-pro.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // In dev/staging, also allow any vercel preview URL
    if (origin && origin.endsWith(".vercel.app")) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Device-Fingerprint"],
  exposedHeaders: ["X-Total-Count"],
  credentials: false,
  optionsSuccessStatus: 204,
};

// Must register OPTIONS handler BEFORE the main cors middleware
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

// ── Body parsing ──────────────────────────────────────────────────────────────
// Paystack webhook needs raw body BEFORE express.json()
app.use("/api/webhooks/paystack", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ── Compression — gzip all responses ─────────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));

// ── Security & performance headers ───────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Keep-Alive", "timeout=30, max=100");
  next();
});

// ── Simple in-memory cache for heavy read endpoints (60s TTL) ────────────────
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

function withCache(key, ttl = CACHE_TTL) {
  return (req, res, next) => {
    // Only cache GET requests for authenticated users
    if (req.method !== "GET") return next();
    const cacheKey = `${key}:${req.user?.id || "anon"}:${req.url}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < ttl) {
      return res.json(cached.data);
    }
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) {
        cache.set(cacheKey, { data, time: Date.now() });
        // Auto-expire
        setTimeout(() => cache.delete(cacheKey), ttl);
      }
      return originalJson(data);
    };
    next();
  };
}

// Clear cache on mutations
function clearCache(pattern) {
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) cache.delete(key);
  }
}
app.locals.clearCache = clearCache;

// ── Health check (no auth, no logging) ───────────────────────────────────────
app.get("/health", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  const isProd = process.env.NODE_ENV === "production";
  res.status(200).json({
    status: "ok",
    service: "FleetAnchor Pro API",
    ...(isProd ? {} : { version: "schema-sync-v2" }),
    timestamp: new Date().toISOString(),
  });
});
app.get("/", (req, res) => {
  res.json({ service: "FleetAnchor Pro API", status: "running" });
});

// ── Routes ────────────────────────────────────────────────────────────────────
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
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/compliance", require("./routes/compliance"));
app.use("/api/driver-licences", require("./routes/driverLicences"));
app.use("/api/inspections", require("./routes/inspections"));
app.use("/api/platform", require("./routes/platform"));
app.use("/api/setup", require("./routes/setup"));

app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
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
