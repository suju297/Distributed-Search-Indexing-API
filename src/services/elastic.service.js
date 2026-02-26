const elasticClient = require("../config/elastic.client");
const config = require("../../config/local.json");

const INDEX_NAME = "plans";

/**
 * Create the index with Parent-Child mapping if it doesn't exist.
 */
const createIndex = async () => {
    try {
        const exists = await elasticClient.indices.exists({ index: INDEX_NAME });
        if (exists) {
            console.log(`Index ${INDEX_NAME} already exists.`);
            return;
        }

        await elasticClient.indices.create({
            index: INDEX_NAME,
            body: {
                mappings: {
                    properties: {
                        plan_join: {
                            type: "join",
                            relations: {
                                plan: ["planCostShares", "linkedPlanServices"],
                                linkedPlanServices: ["linkedService", "planserviceCostShares"],
                            },
                        },
                        objectId: { type: "keyword" },
                        objectType: { type: "keyword" },
                        planType: { type: "keyword" },
                        _org: { type: "keyword" },
                        creationDate: { type: "date", format: "dd-MM-yyyy" },
                    },
                },
            },
        });
        console.log(`Index ${INDEX_NAME} created with Parent-Child mapping.`);
    } catch (err) {
        console.error("Error creating index:", err);
    }
};

/**
 * Index a Plan (Parent).
 */
const indexPlan = async (plan) => {
    try {
        await elasticClient.index({
            index: INDEX_NAME,
            id: plan.objectId,
            routing: plan.objectId, // Route by parent ID
            body: {
                ...plan,
                plan_join: {
                    name: "plan",
                },
            },
        });
        console.log(`Indexed plan: ${plan.objectId}`);
    } catch (err) {
        console.error(`Error indexing plan ${plan.objectId}:`, err);
    }
};

/**
 * Index a PlanCostShares (Child of Plan).
 */
const indexPlanCostShares = async (planCostShares, parentId) => {
    try {
        await elasticClient.index({
            index: INDEX_NAME,
            id: planCostShares.objectId,
            routing: parentId, // Must route to same shard as parent
            body: {
                ...planCostShares,
                plan_join: {
                    name: "planCostShares",
                    parent: parentId,
                },
            },
        });
        console.log(`Indexed planCostShares: ${planCostShares.objectId} (Parent: ${parentId})`);
    } catch (err) {
        console.error(`Error indexing planCostShares ${planCostShares.objectId}:`, err);
    }
};

/**
 * Index a LinkedPlanService (Child of Plan).
 */
const indexLinkedPlanService = async (linkedPlanService, parentId) => {
    try {
        await elasticClient.index({
            index: INDEX_NAME,
            id: linkedPlanService.objectId,
            routing: parentId,
            body: {
                _org: linkedPlanService._org,
                objectId: linkedPlanService.objectId,
                objectType: linkedPlanService.objectType,
                plan_join: {
                    name: "linkedPlanServices",
                    parent: parentId,
                },
            },
        });
        console.log(`Indexed linkedPlanService: ${linkedPlanService.objectId} (Parent: ${parentId})`);
    } catch (err) {
        console.error(`Error indexing linkedPlanService ${linkedPlanService.objectId}:`, err);
    }
};

/**
 * Index a LinkedService (Child of LinkedPlanService).
 */
const indexLinkedService = async (linkedService, linkedPlanServiceId, planId) => {
    try {
        await elasticClient.index({
            index: INDEX_NAME,
            id: linkedService.objectId,
            routing: planId, // all children share root routing
            body: {
                ...linkedService,
                plan_join: {
                    name: "linkedService",
                    parent: linkedPlanServiceId,
                },
            },
        });
        console.log(`Indexed linkedService: ${linkedService.objectId} (Parent: ${linkedPlanServiceId})`);
    } catch (err) {
        console.error(`Error indexing linkedService ${linkedService.objectId}:`, err);
    }
};

/**
 * Index a PlanServiceCostShares (Child of LinkedPlanService).
 */
const indexPlanServiceCostShares = async (planserviceCostShares, linkedPlanServiceId, planId) => {
    try {
        await elasticClient.index({
            index: INDEX_NAME,
            id: planserviceCostShares.objectId,
            routing: planId,
            body: {
                ...planserviceCostShares,
                plan_join: {
                    name: "planserviceCostShares",
                    parent: linkedPlanServiceId,
                },
            },
        });
        console.log(`Indexed planserviceCostShares: ${planserviceCostShares.objectId} (Parent: ${linkedPlanServiceId})`);
    } catch (err) {
        console.error(`Error indexing planserviceCostShares ${planserviceCostShares.objectId}:`, err);
    }
};

/**
 * Delete a document (Plan or Service) by ID.
 */
const deleteDocument = async (id) => {
    try {
        // Delete the plan and all its children (all share the same routing)
        await elasticClient.deleteByQuery({
            index: INDEX_NAME,
            body: {
                query: {
                    term: {
                        _routing: id,
                    },
                },
            },
        });
        console.log(`Deleted document tree routed by: ${id}`);
    } catch (err) {
        console.error(`Error deleting document ${id}:`, err);
    }
};

module.exports = {
    createIndex,
    indexPlan,
    indexPlanCostShares,
    indexLinkedPlanService,
    indexLinkedService,
    indexPlanServiceCostShares,
    deleteDocument,
};
