const express = require("express");
const { verifyToken } = require("../middlewares/auth.middleware");

const planRoute = require("./plan.route");

const router = express.Router();

router.use("/plan", verifyToken, planRoute);

module.exports = router;
