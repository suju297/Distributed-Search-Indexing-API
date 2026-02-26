const { Client } = require("@elastic/elasticsearch");
const config = require("../../config/local.json");

const elasticClient = new Client({
    node: config.ELASTIC_NODE || "http://localhost:9200",
});

module.exports = elasticClient;
