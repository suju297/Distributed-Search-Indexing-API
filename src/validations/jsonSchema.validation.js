const Ajv = require("ajv");

/**
 * Shared Ajv instance
 * - allErrors: report all validation errors instead of stopping at the first
 * - async: kept for backward-compat; actual async validation requires `$async: true` in the schema
 * - strict: false to relax strictness (useful while iterating on schemas)
 */
const ajvClient = new Ajv({
  allErrors: true,
  async: true, // retained for compatibility
  strict: false,
});

/**
 * Validate a JSON object against a JSON Schema using Ajv.
 *
 * @param {object} json   The data to validate.
 * @param {object} schema The JSON Schema to validate against.
 * @returns {Promise<{error: boolean, data?: Array}>}
 *   - { error: false } when valid
 *   - { error: true, data: <normalized Ajv errors> } when invalid
 */
const validateJSONSchema = async (json, schema) => {
  try {
    // Compile the schema (Ajv caches compiled schemas under the hood)
    const validate = ajvClient.compile(schema);

    // If the schema includes `$async: true`, validate(...) returns a Promise
    const valid = await validate(json);

    if (!valid) {
      const errors = parseErrors(validate.errors);
      return { error: true, data: errors };
    }

    return { error: false };
  } catch (e) {
    // Handles schema compilation errors or thrown validation errors for $async schemas
    return {
      error: true,
      data: [
        {
          message: e.message || "Schema compilation/validation error",
        },
      ],
    };
  }
};

/**
 * Normalize Ajv's error objects into a compact, serializable shape.
 *
 * @param {Array} validationErrors Ajv's `validate.errors` array.
 * @returns {Array<{path: string, message: string, keyword: string, params: object, schemaPath: string}>}
 */
const parseErrors = (validationErrors = []) => {
  return validationErrors.map((err) => ({
    path: err.instancePath || err.dataPath || "",
    message: err.message || "Validation error",
    keyword: err.keyword,
    params: err.params,
    schemaPath: err.schemaPath,
  }));
};

module.exports = {
  validateJSONSchema,
  // Alias to keep compatibility with existing imports elsewhere in your codebase.
  isValidJSONSchema: validateJSONSchema,
};
