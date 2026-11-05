const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { param, query } = require("express-validator");
const { validate } = require("../middleware/validate");
const cc = require("../controllers/chatController");

router.use(authenticate);

const vendorQ = query("vendorId").optional().isUUID();

router.get("/summary", vendorQ, validate, cc.summary);
router.get("/:channel/messages", param("channel").isIn(Object.keys(cc.CHANNELS)), vendorQ, query("after").optional().isISO8601(), validate, cc.list);
router.post("/:channel/messages", param("channel").isIn(Object.keys(cc.CHANNELS)), vendorQ, validate, cc.send);
router.delete("/messages/:id", param("id").isUUID(), vendorQ, validate, cc.remove);

module.exports = router;
