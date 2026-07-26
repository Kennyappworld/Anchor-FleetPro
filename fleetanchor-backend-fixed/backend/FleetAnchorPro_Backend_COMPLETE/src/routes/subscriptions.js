const router = require("express").Router();
const { authenticate, requireRole, scopeToTenant } = require("../middleware/auth");
const { body, param, query } = require("express-validator");
const { validate } = require("../middleware/validate");
const sc = require("../controllers/subscriptionController");

router.use(authenticate, scopeToTenant);

router.get("/", sc.list);
router.get("/:vendorId", param("vendorId").isUUID(), validate, sc.getForVendor);

router.post("/initiate",
  requireRole(["SUPER_ADMIN","OEM_ADMIN","FLEET_MANAGER"]),
  body("vendorId").isUUID(),
  body("plan").isIn(["GROWTH","ENTERPRISE"]),
  validate,
  sc.initiate
);

router.get("/verify",
  query("reference").notEmpty(),
  validate,
  sc.verify
);

router.post("/extend",
  requireRole(["SUPER_ADMIN"]),
  body("vendorId").isUUID(),
  body("days").isInt({ min: 1, max: 3650 }),
  validate,
  sc.extend
);

router.post("/demo",
  requireRole(["SUPER_ADMIN"]),
  body("vendorId").isUUID(),
  body("enabled").isBoolean(),
  validate,
  sc.toggleDemo
);

router.post("/:id/cancel",
  requireRole(["SUPER_ADMIN","OEM_ADMIN","FLEET_MANAGER"]),
  param("id").isUUID(),
  validate,
  sc.cancel
);

module.exports = router;
