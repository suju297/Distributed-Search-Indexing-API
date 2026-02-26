const redis = require("redis");
const config = require("../../config/local.json");

/**
 * Create a Redis client.
 * Ref: https://www.npmjs.com/package/redis
 */
const redisClient = redis.createClient({
  url: `redis://${config.DB_HOST}:${config.DB_PORT}`
});

// Redis event: CONNECT
redisClient.on("connect", () => {
  console.log("Redis client connected");
});

// Redis event: ERROR
redisClient.on("error", (err) => {
  console.error("Redis client error:", err);
});

// Open connection
redisClient.connect();

/**
 * Check if a key exists.
 */
const ifKeyExists = async (redisKey) => {
  const exists = await redisClient.exists(redisKey);
  return Boolean(exists);
};

/**
 * Read the ETag (stored under field "eTag") for a hash key.
 */
const getETag = async (redisKey) => {
  return await redisClient.hGet(redisKey, "eTag");
};

/**
 * Set the ETag (stored under field "eTag") for a hash key.
 */
const setETag = async (redisKey, etag) => {
  return await redisClient.hSet(redisKey, "eTag", etag);
};

/**
 * Add a member to a Redis set.
 */
const addSetValue = async (setKey, value) => {
  return await redisClient.sAdd(setKey, value);
};

/**
 * Set a field on a Redis hash or multiple fields if value is an object.
 */
const hSet = async (hashKey, fieldOrObject, value) => {
  if (typeof fieldOrObject === 'object' && fieldOrObject !== null) {
    // Modern redis client hSet supports (key, object)
    return await redisClient.hSet(hashKey, fieldOrObject);
  }
  return await redisClient.hSet(hashKey, fieldOrObject, value);
};

/**
 * Get all keys matching a pattern.
 */
const getKeys = async (pattern) => {
  return await redisClient.keys(pattern);
};

/**
 * Delete one or more keys.
 */
const deleteKeys = async (keys) => {
  return await redisClient.del(keys);
};

/**
 * Get all field/value pairs for a Redis hash.
 */
const getAllValuesByKey = async (hashKey) => {
  return await redisClient.hGetAll(hashKey);
};

/**
 * Get all members of a Redis set.
 */
const sMembers = async (setKey) => {
  return await redisClient.sMembers(setKey);
};

module.exports = {
  ifKeyExists,
  getETag,
  setETag,
  addSetValue,
  hSet,
  getKeys,
  deleteKeys,
  getAllValuesByKey,
  sMembers,
};
