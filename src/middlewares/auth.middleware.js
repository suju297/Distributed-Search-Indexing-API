const authService = require("../services/auth.service");
const status = require("http-status");

const HEADER_KEY = "Bearer";

/**
 * Middleware to verify token via Google OAuth (or Mock).
 */
const verifyToken = async (req, res, next) => {
  console.log("verifyToken middleware called");

  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    console.log("No auth header");
    return res.status(status.UNAUTHORIZED).send({
      message: "Access denied. No token provided.",
    });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== HEADER_KEY) {
    return res.status(status.UNAUTHORIZED).send({
      message: "Access denied. Invalid token format.",
    });
  }

  const token = parts[1];

  const isAuthorized = await authService.isUserAuthorized(token);
  if (!isAuthorized) {
    console.log("User not authorized by Google/Mock service");
    return res.status(status.UNAUTHORIZED).send({
      message: "Invalid token or Unauthorized user.",
    });
  }

  next();
};

// No longer exporting generateToken as we don't generate Google tokens locally
// But we can export a dummy one if existing tests rely on it, but better to update tests.
module.exports = {
  verifyToken,
};
