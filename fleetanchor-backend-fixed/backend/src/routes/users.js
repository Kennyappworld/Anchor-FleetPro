const router = require("express").Router();
const { authenticate, requireRole, scopeToTenant } = require("../middleware/auth");
const { body, param } = require("express-validator");
const { validate } = require("../middleware/validate");
const uc = require("../controllers/userController");

router.use(authenticate, scopeToTenant);

router.get("/", uc.list);
router.get("/me", uc.me);
router.get("/:id", param("id").isUUID(), validate, uc.getOne);

router.post("/",
  requireRole(["SUPER_ADMIN","OEM_ADMIN","FLEET_MANAGER"]),
  body("fullName").trim().notEmpty(),
  body("email").isEmail().normalizeEmail(),
  body("role").isIn(["OEM_ADMIN","WORKSHOP_STAFF","FLEET_MANAGER","MAINTENANCE_SUPERVISOR","FIELD_AGENT"]),
  validate,
  uc.create
);

router.patch("/:id", param("id").isUUID(), validate, uc.update);

router.post("/:id/suspend",
  requireRole(["SUPER_ADMIN","OEM_ADMIN","FLEET_MANAGER"]),
  param("id").isUUID(),
  validate,
  uc.suspend
);

router.delete("/:id",
  requireRole(["SUPER_ADMIN","OEM_ADMIN"]),
  param("id").isUUID(),
  validate,
  uc.remove
);

module.exports = router;