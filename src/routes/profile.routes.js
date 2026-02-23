const router = require("express").Router();
const { protect } = require("../middleware/protect");
const {
  getProfile,
  updateProfile,
  addEmail,
  removeEmail,
  deleteAccount
} = require("../controllers/profile.controller");

router.use(protect);

router.get("/", getProfile);
router.put("/", updateProfile);
router.post("/emails", addEmail);
router.delete("/emails/:emailId", removeEmail);
router.delete("/account", deleteAccount);

module.exports = router;
