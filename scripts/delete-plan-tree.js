// Delete an entire plan tree (plan + children) from Elasticsearch by plan objectId/routing.
// Usage: node scripts/delete-plan-tree.js <planObjectId>
const elasticClient = require("../src/config/elastic.client");

const INDEX = "plans";

const planId = process.argv[2];

if (!planId) {
  console.error("Usage: node scripts/delete-plan-tree.js <planObjectId>");
  process.exit(1);
}

async function run() {
  const exists = await elasticClient.indices.exists({ index: INDEX });
  if (!exists) {
    console.error(`Index "${INDEX}" does not exist.`);
    return;
  }

  const res = await elasticClient.deleteByQuery({
    index: INDEX,
    body: {
      query: {
        term: {
          _routing: planId,
        },
      },
    },
  });

  console.log(
    `Deleted ${res.body.deleted ?? res.deleted ?? 0} documents routed by ${planId} from index "${INDEX}".`
  );
}

run().catch((err) => {
  console.error("Failed to delete plan tree:", err);
  process.exit(1);
});
