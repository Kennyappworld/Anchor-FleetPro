const router = require("express").Router();
const { authenticate, requireRole, scopeToTenant } = require("../middleware/auth");
const { body, param } = require("express-validator");
const { validate } = require("../middleware/validate");
const jc = require("../controllers/jobController");

router.use(authenticate, scopeToTenant);

router.get("/", jc.list);
router.get("/:id", param("id").isUUID(), validate, jc.get);

router.post("/",
  body("vehicleId").isUUID(),
  body("category").trim().notEmpty(),
  body("description").trim().isLength({ min: 5 }),
  validate,
  jc.create
);

router.patch("/:id/status",
  param("id").isUUID(),
  body("status").isIn(["DIAGNOSED","ESTIMATE_SENT","APPROVED","REPAIR_STARTED","COMPLETED","PAYMENT_CONFIRMED","CLOSED","QUERIED"]),
  validate,
  jc.updateStatus
);

router.post("/:id/estimate-response",
  requireRole(["FLEET_MANAGER","MAINTENANCE_SUPERVISOR","OEM_ADMIN","SUPER_ADMIN"]),
  param("id").isUUID(),
  body("action").isIn(["approve","query"]),
  validate,
  jc.respondToEstimate
);

module.exports = router;