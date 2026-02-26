const status = require("http-status");
const { ifKeyExists, getETag, getKeys } = require("../services/redis.service");
const config = require("../../config/local.json");
const { isValidJSONSchema } = require("../services/jsonSchema.service");
const { mergeObjects } = require("../services/plan.service");
const { enqueueMessage } = require("../services/queue.service");

const PLAN_SCHEMA = require("../models/plan.model");
const {
  createSavePlan,
  getSavedPlan,
  deleteSavedPlan,
  generateETag,
} = require("../services/plan.service");

const getPlan = async (req, res) => {
  console.log("GET /plan/:objectId invoked");
  try {
    const { objectId } = req.params;

    // create key in the format - <type>_<objectId>
    const planKey = `${config.PLAN_TYPE}_${objectId}`;

    const keyExists = await ifKeyExists(planKey);
    console.log(`Looking up key: ${planKey}`);

    // check for valid objectId
    if (!keyExists) {
      console.log(`${planKey} not found`);
      return res.status(status.NOT_FOUND).send({
        message: `Invalid objectId: ${objectId}`,
        value: objectId,
        type: "Invalid",
      });
    }

    const etag = await getETag(planKey);

    const clientETag = req.headers["if-none-match"];
    if (clientETag && clientETag === etag) {
      console.log(`ETag match (${etag}); returning 304`);
      res.setHeader("ETag", etag);
      return res.status(status.NOT_MODIFIED).end();
    }

    console.log("Retrieving plan...");
    const plan = await getSavedPlan(planKey);
    console.log("Plan retrieved");
    res.setHeader("ETag", etag);
    return res.status(status.OK).send(plan);
  } catch (error) {
    return res.status(status.INTERNAL_SERVER_ERROR).send({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const createPlan = async (req, res) => {
  console.log("POST /plan invoked");
  try {
    const planJSON = req.body;
    if (!planJSON) {
      return res.status(status.BAD_REQUEST).send({
        message: "Invalid body",
        type: "Invalid",
      });
    }

    console.log("Validating JSON body");
    const isValidSchema = await isValidJSONSchema(planJSON, PLAN_SCHEMA);

    if (isValidSchema?.error) {
      console.log("JSON schema validation failed");
      return res.status(status.BAD_REQUEST).send({
        message: "Invalid schema",
        type: "Invalid",
        ...isValidSchema?.data,
      });
    }

    console.log("JSON schema valid");
    const planKey = `${config.PLAN_TYPE}_${planJSON.objectId}`;

    console.log(`Checking if plan exists: ${planKey}`);
    const keyExists = await ifKeyExists(planKey);
    if (keyExists) {
      console.log(`${planKey} already exists`);
      return res.status(status.CONFLICT).send({
        message: `Plan already exists: ${planJSON.objectId}`,
        type: "Already Exists",
      });
    }

    console.log("Creating plan...");
    await createSavePlan(planKey, planJSON);
    console.log("Plan created");
    const etag = generateETag(planKey, planJSON);
    console.log("ETag generated");

    // Enqueue for indexing
    await enqueueMessage("CREATE", planJSON);

    res.setHeader("ETag", etag);

    const location = `http://localhost:8000/v1/plan/${planJSON.objectId}`;
    res.setHeader("Location", location);

    return res.status(status.CREATED).send({
      message: "Plan created successfully",
      objectId: planJSON.objectId,
    });
  } catch (error) {
    // kept status code the same to avoid behavior changes
    return res.status(status.UNAUTHORIZED).send({
      message: "Bad Request or Unauthorized",
    });
  }
};

const deletePlan = async (req, res) => {
  try {
    const { objectId } = req.params;
    console.log("DELETE /plan/:objectId invoked");

    // create key in the format - <type>_<objectId>
    const planKey = `${config.PLAN_TYPE}_${objectId}`;

    console.log(`Looking up key: ${planKey}`);

    // Check if the key is present in Redis
    const keyExists = await ifKeyExists(planKey);

    // check for valid objectId
    if (!keyExists) {
      console.log(`${planKey} not found`);
      return res.status(status.NOT_FOUND).send({
        message: `No plan found for objectId: ${objectId}`,
        value: objectId,
        type: "Invalid",
      });
    }

    console.log("Deleting plan...");
    await deleteSavedPlan(planKey);
    console.log("Plan deleted");

    // Enqueue for deletion
    await enqueueMessage("DELETE", objectId);

    return res.status(status.NO_CONTENT).send({
      message: "Plan deleted successfully",
      objectId,
    });
  } catch (error) {
    console.error("Error encountered:", error);
    // kept status code the same to avoid behavior changes
    return res.status(status.UNAUTHORIZED).send({
      message: "Bad Request or Unauthorized",
    });
  }
};

const getAllPlans = async (req, res) => {
  console.log("GET /plan (all) invoked");
  try {
    const pattern = `${config.PLAN_TYPE}_*`;
    const keys = await getKeys(pattern);

    if (!keys || keys.length === 0) {
      return res.status(status.NOT_FOUND).send({
        message: "No plans found",
      });
    }

    const plans = [];
    for (const planKey of keys) {
      const plan = await getSavedPlan(planKey);
      plans.push(plan);
    }

    return res.status(status.OK).send(plans);
  } catch (error) {
    console.error("Error fetching all plans:", error);
    return res.status(status.INTERNAL_SERVER_ERROR).send({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


const patchPlan = async (req, res) => {
  try {
    const { objectId } = req.params;
    const patchData = req.body;

    console.log("Executing the PATCH method.");

    // create key in the format - <type>_<objectId>
    const KEY = `${config.PLAN_TYPE}_${objectId}`;

    console.log(`Key to deal with: ${KEY}`);

    // Check if the KEY is present in the database(redis)
    const isKeyValid = await ifKeyExists(KEY);

    // check for valid objectId
    if (!isKeyValid) {
      console.log(`${KEY}: not valid!`);
      return res.status(status.NOT_FOUND).send({
        message: `Invalid ObjectId! - ${objectId}`,
        value: objectId,
        type: "Invalid",
      });
    }

    // If invalid body
    if (!patchData || Object.keys(patchData).length === 0) {
      return res.status(status.BAD_REQUEST).send({
        message: "Invalid body!",
        type: "Invalid",
      });
    }

    console.log("Fetching existing plan...");
    let existingPlan = await getSavedPlan(KEY);

    // Handle If-Match header for precondition
    const urlETag = req.headers["if-match"];
    if (!urlETag) {
      return res.status(status.PRECONDITION_REQUIRED).send({
        message: "Missing If-Match header!",
      });
    }

    const currentETag = await getETag(KEY);
    if (urlETag !== currentETag) {
      res.setHeader("ETag", currentETag);
      return res.status(status.PRECONDITION_FAILED).send({
        message: "ETag mismatch!",
      });
    }

    console.log("Updating plan with patch data...");

    // Recursively merge patchData into existingPlan
    try {
      await mergeObjects(existingPlan, patchData);
    } catch (error) {
      return res.status(status.INTERNAL_SERVER_ERROR).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }

    console.log("Validating updated plan...");
    const isValidSchema = await isValidJSONSchema(existingPlan, PLAN_SCHEMA);

    if (isValidSchema?.error) {
      console.log("Invalid JSON");
      return res.status(status.BAD_REQUEST).send({
        message: "Invalid Schema!",
        type: "Invalid",
        ...isValidSchema?.data,
      });
    }

    console.log("Saving updated plan...");
    await createSavePlan(KEY, existingPlan);
    const newETag = generateETag(KEY, existingPlan);

    // Enqueue for indexing
    await enqueueMessage("UPDATE", existingPlan);

    console.log("Updated successfully!!");
    res.setHeader("ETag", newETag);
    return res.status(status.OK).send(existingPlan);
  } catch (error) {
    console.log("Error:", error);
    return res.status(status.INTERNAL_SERVER_ERROR).send({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getPlan,
  createPlan,
  deletePlan,
  getAllPlans,
  patchPlan,
};
