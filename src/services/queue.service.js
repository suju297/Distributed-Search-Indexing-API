const amqp = require("amqplib");
const elasticService = require("./elastic.service");

const RABBITMQ_URL = "amqp://localhost";
const QUEUE_NAME = "indexing_queue";

let channel = null;

/**
 * Connect to RabbitMQ and create channel.
 */
const connectQueue = async () => {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        console.log("Connected to RabbitMQ");
    } catch (err) {
        console.error("RabbitMQ Connection Error:", err.message);
        // Retry logic could be added here
    }
};

/**
 * Enqueue a message for processing.
 * @param {string} type - 'CREATE', 'UPDATE', 'DELETE'
 * @param {object} data - The data to process (plan object or objectId)
 */
const enqueueMessage = async (type, data) => {
    if (!channel) {
        console.error("RabbitMQ channel not established. Message lost.");
        return;
    }
    const message = JSON.stringify({ type, data });
    channel.sendToQueue(QUEUE_NAME, Buffer.from(message), { persistent: true });
    console.log(`Enqueued message: ${type}`);
};

/**
 * Process a single message.
 */
const processMessage = async (msg) => {
    if (!msg) return;

    try {
        const content = msg.content.toString();
        const { type, data } = JSON.parse(content);
        console.log(`Processing message: ${type}`);

        if (type === "CREATE" || type === "UPDATE") {
            // Index Plan (Parent)
            await elasticService.indexPlan(data);

            // Index planCostShares (Child of Plan)
            if (data.planCostShares) {
                await elasticService.indexPlanCostShares(data.planCostShares, data.objectId);
            }

            // Index Linked Plan Services hierarchy
            if (data.linkedPlanServices && Array.isArray(data.linkedPlanServices)) {
                for (const linkedService of data.linkedPlanServices) {
                    // linkedPlanServices doc
                    await elasticService.indexLinkedPlanService(linkedService, data.objectId);

                    // linkedService (child of linkedPlanServices)
                    if (linkedService.linkedService) {
                        await elasticService.indexLinkedService(
                            linkedService.linkedService,
                            linkedService.objectId,
                            data.objectId
                        );
                    }

                    // planserviceCostShares (child of linkedPlanServices)
                    if (linkedService.planserviceCostShares) {
                        await elasticService.indexPlanServiceCostShares(
                            linkedService.planserviceCostShares,
                            linkedService.objectId,
                            data.objectId
                        );
                    }
                }
            }
        } else if (type === "DELETE") {
            await elasticService.deleteDocument(data); // data is objectId here
        }

        // Acknowledge message
        channel.ack(msg);
    } catch (err) {
        console.error("Error processing message:", err);
        // Depending on error, we might want to nack or reject
        // channel.nack(msg);
    }
};

/**
 * Start the worker to consume messages.
 */
const startWorker = async () => {
    if (!channel) {
        await connectQueue();
    }

    if (channel) {
        console.log("Queue worker started...");
        channel.consume(QUEUE_NAME, processMessage);
    } else {
        console.error("Failed to start worker: No RabbitMQ channel");
    }
};

module.exports = {
    enqueueMessage,
    startWorker,
};
