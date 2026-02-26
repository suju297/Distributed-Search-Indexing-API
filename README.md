# Distributed Health Plan Indexing API

Node.js/Express service for authenticated health plan CRUD operations with Redis-backed storage, optimistic concurrency via ETags, and asynchronous Elasticsearch indexing through RabbitMQ.

Recommended GitHub repository name: `distributed-health-plan-indexer`

## Why This Project (Resume-Friendly)

This project demonstrates a distributed data indexing workflow:

- REST API built with Express
- Google token-based authentication (with local mock token support)
- Redis used as the primary operational data store for plan documents and ETags
- RabbitMQ used for asynchronous indexing jobs
- Elasticsearch parent-child join mapping for searchable plan hierarchies
- ETag-based concurrency control for `GET` and `PATCH`

## Architecture Overview

### C4 Container Diagram

![C4 Container Diagram](docs/diagrams/c4-container-diagram.png)

### Bird's-Eye Architecture View

![Bird's-Eye Architecture View](docs/diagrams/birds-eye-architecture-view.png)

Color key used in the diagrams:

- Blue: client ingress / HTTP requests
- Red: identity and token verification
- Indigo/Violet: application runtime and processing logic
- Green: Redis operational data + ETag state
- Amber: RabbitMQ async event flow
- Orange: Elasticsearch indexing/search path

## Tech Stack

- Node.js + Express
- Redis (`redis` client)
- RabbitMQ (`amqplib`)
- Elasticsearch (`@elastic/elasticsearch`)
- AJV (JSON schema validation)
- Google OAuth token verification (`google-auth-library`)

## Project Structure

```text
.
├── config/
│   └── local.json                 # Local app config (port, Redis host/port, plan type)
├── scripts/
│   └── delete-plan-tree.js        # Deletes an ES plan tree by routing/objectId
├── src/
│   ├── app.js                     # App bootstrap, middleware, routes, healthz
│   ├── config/elastic.client.js   # Elasticsearch client
│   ├── controllers/               # Route handlers (plan CRUD)
│   ├── middlewares/               # Auth middleware
│   ├── models/                    # JSON schema for plan payload
│   ├── routes/                    # API route definitions
│   ├── services/                  # Redis, queue, elastic, auth, plan logic
│   └── validations/               # AJV schema validation wrapper
├── static/plan.test.json          # Sample request payload
├── server.js                      # HTTP server entry point
└── start_all.sh                   # Starts Redis, RabbitMQ, Elasticsearch, then API
```

## Data Model Notes

The API accepts a root `plan` document with nested objects:

- `planCostShares`
- `linkedPlanServices[]`
  - `linkedService`
  - `planserviceCostShares`

The service stores the plan and nested entities in Redis hashes and separately indexes the hierarchy into Elasticsearch using a join mapping for parent-child queries.

## API Endpoints

All `/v1/plan` endpoints require a Bearer token.

- Local mock token (for development/testing): `MOCK_TEST_TOKEN_DEMO3_VERIFICATION`
- Health endpoint does not require auth: `GET /healthz`

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Health check |
| `POST` | `/v1/plan` | Create a plan |
| `GET` | `/v1/plan` | List all plans (from Redis) |
| `GET` | `/v1/plan/:objectId` | Fetch one plan by `objectId` |
| `PATCH` | `/v1/plan/:objectId` | Deep merge patch (objectId-aware array merge) |
| `DELETE` | `/v1/plan/:objectId` | Delete a plan and its indexed tree |

## ETag and Concurrency Behavior

- `POST /v1/plan` returns an `ETag` header.
- `GET /v1/plan/:objectId`
  - Supports `If-None-Match`
  - Returns `304 Not Modified` when the ETag matches
- `PATCH /v1/plan/:objectId`
  - Requires `If-Match`
  - Returns `428 Precondition Required` if missing
  - Returns `412 Precondition Failed` on ETag mismatch

## Local Setup

### Prerequisites

- Node.js (18+ recommended)
- Redis
- RabbitMQ
- Elasticsearch (local, default `http://localhost:9200`)

### Environment Variables

Create/update `.env`:

```bash
GOOGLE_CLIENT_ID="<your-google-oauth-client-id>"
```

### Install

```bash
npm install
```

### Run (manual)

1. Start Redis (`6379`)
2. Start RabbitMQ (`5672`)
3. Start Elasticsearch (`9200`)
4. Start API:

```bash
npm start
```

### Run (helper script)

The script `start_all.sh` attempts to start Redis, RabbitMQ, Elasticsearch, then the Node server:

```bash
./start_all.sh
```

### Health Check

```bash
curl http://localhost:8000/healthz
```

## Example Requests

Use the sample payload in `static/plan.test.json`.

### Create a Plan

```bash
curl -i -X POST http://localhost:8000/v1/plan \
  -H "Authorization: Bearer MOCK_TEST_TOKEN_DEMO3_VERIFICATION" \
  -H "Content-Type: application/json" \
  --data @static/plan.test.json
```

### Get a Plan

```bash
curl -i http://localhost:8000/v1/plan/12xvxc345ssdsds-508 \
  -H "Authorization: Bearer MOCK_TEST_TOKEN_DEMO3_VERIFICATION"
```

### Patch a Plan (requires `If-Match`)

```bash
curl -i -X PATCH http://localhost:8000/v1/plan/12xvxc345ssdsds-508 \
  -H "Authorization: Bearer MOCK_TEST_TOKEN_DEMO3_VERIFICATION" \
  -H "If-Match: <etag-from-GET-or-POST>" \
  -H "Content-Type: application/json" \
  -d '{"planType":"outOfNetwork"}'
```

### Delete a Plan

```bash
curl -i -X DELETE http://localhost:8000/v1/plan/12xvxc345ssdsds-508 \
  -H "Authorization: Bearer MOCK_TEST_TOKEN_DEMO3_VERIFICATION"
```

## Elasticsearch Notes

- Index name: `plans`
- Mapping is created automatically at startup if the index does not exist
- Join relations configured in `src/services/elastic.service.js`:
  - `plan -> [planCostShares, linkedPlanServices]`
  - `linkedPlanServices -> [linkedService, planserviceCostShares]`

### Recreate the Index

```bash
curl -X DELETE http://localhost:9200/plans
```

Restart the app to auto-create the index with the current mapping.

### Delete a Plan Tree by Routing (Elasticsearch)

```bash
node scripts/delete-plan-tree.js <planObjectId>
```

or

```bash
curl -X POST http://localhost:9200/plans/_delete_by_query \
  -H "Content-Type: application/json" \
  -d '{"query":{"term":{"_routing":"<planObjectId>"}}}'
```

## Example Elasticsearch Queries

### Find plans where nested `planserviceCostShares.copay >= 1`

```json
GET plans/_search
{
  "query": {
    "has_child": {
      "type": "linkedPlanServices",
      "query": {
        "has_child": {
          "type": "planserviceCostShares",
          "query": { "range": { "copay": { "gte": 1 } } },
          "inner_hits": {}
        }
      },
      "inner_hits": {}
    }
  }
}
```

### Find child documents whose parent is a `plan`

```json
GET plans/_search
{
  "query": {
    "has_parent": {
      "parent_type": "plan",
      "query": { "match_all": {} },
      "inner_hits": {}
    }
  }
}
```

## Notes for Recruiters / Reviewers

- This project emphasizes backend systems integration and asynchronous indexing pipelines.
- The design intentionally separates API write latency from search indexing latency using RabbitMQ.
- The Elasticsearch model demonstrates parent-child joins and routing-aware indexing.
