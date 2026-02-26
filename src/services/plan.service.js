const {
  hSet,
  deleteKeys,
  getAllValuesByKey,
  setETag,
} = require("./redis.service");
const hash = require("object-hash");

/**
 * Helper: Try to parse JSON, otherwise return original string.
 */
const tryParse = (val) => {
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    if (typeof parsed === 'number') return parsed;
    if (typeof parsed === 'boolean') return parsed;
    return val;
  } catch (e) {
    return val;
  }
};

/**
 * Helper to construct a Redis key from objectType and objectId
 */
const makeKey = (type, id) => `${type}_${id}`;

/**
 * Fetch a saved plan (or any object) by Redis key.
 */
const getSavedPlan = async (key) => {
  try {
    const raw = await getAllValuesByKey(key);
    if (!raw || Object.keys(raw).length === 0) {
      throw new Error("Plan data not found");
    }

    const reconstructed = {};
    for (const [k, v] of Object.entries(raw)) {
      reconstructed[k] = tryParse(v);
    }

    return reconstructed;
  } catch (err) {
    console.error(`Error fetching data for key ${key}:`, err);
    throw err;
  }
};

/**
 * Recursively save an object and its nested components.
 */
const saveObjectRecursively = async (obj) => {
  if (Array.isArray(obj)) {
    const result = [];
    for (const item of obj) {
      if (typeof item === "object" && item !== null && item.objectId && item.objectType) {
        await saveObjectRecursively(item);
        result.push(item);
      } else {
        result.push(item);
      }
    }
    return result;
  }

  if (typeof obj === "object" && obj !== null) {
    if (obj.objectId && obj.objectType) {
      const key = makeKey(obj.objectType, obj.objectId);
      const toSave = {};

      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v)) {
          await saveObjectRecursively(v);
          toSave[k] = JSON.stringify(v);
        } else if (typeof v === "object" && v !== null) {
          await saveObjectRecursively(v);
          toSave[k] = JSON.stringify(v);
        } else {
          toSave[k] = v;
        }
      }
      await hSet(key, toSave);
      console.log(`Saved individual object: ${key}`);
      return obj;
    }

    // Non-entity object (no ID), just recurse properties
    for (const [k, v] of Object.entries(obj)) {
      await saveObjectRecursively(v);
    }
  }
  return obj;
};

const createSavePlan = async (planKey, planJson) => {
  try {
    // Recursively save all entities in the plan
    await saveObjectRecursively(planJson);
    console.log(`Saved plan hierarchy.`);
  } catch (err) {
    console.error(`Error saving plan:`, err);
    throw err;
  }
};

/**
 * Recursively delete an object and its children.
 */
const deleteSavedPlan = async (key) => {
  try {
    const raw = await getAllValuesByKey(key);
    if (!raw || Object.keys(raw).length === 0) return;

    // Traverse to find children to delete
    for (const [k, v] of Object.entries(raw)) {
      const val = tryParse(v);
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && item.objectId && item.objectType) {
            const childKey = makeKey(item.objectType, item.objectId);
            await deleteSavedPlan(childKey);
          }
        }
      } else if (typeof val === "object" && val !== null) {
        if (val.objectId && val.objectType) {
          const childKey = makeKey(val.objectType, val.objectId);
          await deleteSavedPlan(childKey);
        }
      }
    }

    await deleteKeys([key]);
    console.log(`Deleted key: ${key}`);
  } catch (err) {
    console.error(`Error deleting key ${key}:`, err);
  }
};

const generateETag = (planKey, jsonObject) => {
  const etag = hash(jsonObject);
  setETag(planKey, etag);
  return etag;
};

const mergeObjects = (target, source) => {
  for (const key in source) {
    if (Array.isArray(source[key])) {
      if (!target[key]) {
        target[key] = [];
      }
      source[key].forEach((newItem) => {
        const existingItemIndex = target[key].findIndex(
          (item) => item.objectId === newItem.objectId
        );
        if (existingItemIndex !== -1) {
          mergeObjects(target[key][existingItemIndex], newItem);
        } else {
          target[key].push(newItem);
        }
      });
    } else if (typeof source[key] === "object" && source[key] !== null) {
      if (!target[key]) {
        target[key] = {};
      }
      mergeObjects(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
};

module.exports = {
  getSavedPlan,
  createSavePlan,
  deleteSavedPlan,
  generateETag,
  mergeObjects
};
