const express    = require("express");
const router     = express.Router();
const controller = require("../controllers/inspectionOfficer.controller");

router.get("/dashboard",                      controller.getDashboardStats);
router.get("/scheduled",                      controller.getScheduledInspections);
router.put("/start/:ticketId",                controller.startInspection);
router.get("/ongoing",                        controller.getOngoingInspections);
router.put("/save-report/:ticketId",          controller.saveReport);
router.put("/record-report/:ticketId",        controller.recordReport);
router.get("/completed",                      controller.getCompletedInspections);
router.get("/report/:ticketId",               controller.getReport);
router.put("/submit-report/:ticketId",        controller.submitReport);

module.exports = router;