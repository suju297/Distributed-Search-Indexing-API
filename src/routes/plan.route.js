const express = require("express");
const { planController } = require("../controllers");

const router = express.Router();

router
  .route("/")
  .post(planController.createPlan)
  .get(planController.getAllPlans);

router
  .route("/:objectId")
  .get(planController.getPlan)
  .delete(planController.deletePlan)
  .patch(planController.patchPlan);

module.exports = router;
