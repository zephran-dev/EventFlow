# EventFlow ⚡

> Event-driven processing system with queues, workers, async pipelines, dead-letter queues, and real-time monitoring.

[![CI/CD](https://github.com/your-org/eventflow/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/eventflow/actions)
[![Coverage](https://codecov.io/gh/your-org/eventflow/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/eventflow)

---

## Architecture

```
src/
├── domain/                  # Business logic — zero dependencies
│   ├── events/              # DomainEvent entity (immutable, state transitions)
│   ├── queues/              # Queue & Pipeline entities
│   └── shared/              # Result monad, DomainErrors
│
├── application/             # Use cases + ports (interfaces)
│   ├── ports/               # IEventRepository, IQueueService, IWorkerRegistry, …
│   └── use-cases/           # PublishEvent, GetQueueStats, RetryDeadLetter
│
├── infrastructure/          # Concrete implementations
│   ├── redis/               # RedisEventRepository, BullMQQueueService, WorkerRegistry
│   ├── logging/             # Winston structured logger
│   └── monitoring/          # Prometheus metrics, WebSocket notifier
│
└── presentation/            # HTTP layer
    └── http/                # Express router, app factory, rate limiting
```

**Dependency rule**: each layer depends only inward. Infrastructure implements Application ports.

---

## Features

- 📨 **Publish events** via REST API with validation
- 🔄 **Async workers** with BullMQ — configurable concurrency
- 🔁 **Automatic retries** with exponential backoff
- ☠️ **Dead-letter queues** — inspect, replay, or discard failed events
- 📊 **Real-time monitoring** via WebSocket + Prometheus metrics
- 🚦 **Rate limiting** on all API endpoints
- 📝 **Structured logging** with Winston (JSON in prod, colorized in dev)
- 🔒 **Immutable domain events** with explicit state machine
- 🐳 **Docker + docker-compose** ready
- ✅ **CI/CD** with GitHub Actions, auto-push to GHCR

---

## Quick Start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Start Redis + app
npm run docker:up

# 3. Or run locally (requires Redis)
npm install
npm run dev
```

---

## API Reference

### Publish Event
```http
POST /api/v1/events
Content-Type: application/json

{
  "type": "order.placed",
  "payload": { "orderId": "abc-123" },
  "source": "shop-service",
  "queueName": "orders",
  "priority": 5,
  "tags": ["vip"]
}
```

### Queue Stats
```http
GET /api/v1/queues
GET /api/v1/queues/:name
POST /api/v1/queues/:name/pause
POST /api/v1/queues/:name/resume
```

### Dead-Letter Queue
```http
GET  /api/v1/queues/:name/dead-letter
POST /api/v1/queues/:name/dead-letter/:eventId/replay
POST /api/v1/queues/:name/retry-failed
```

### Observability
```http
GET /health    → { status: "ok", timestamp: "…" }
GET /metrics   → Prometheus text format
WS  ws://localhost:3001/ws  → real-time event & stats stream
```

---

## Registering Workers

```typescript
workerRegistry.register('orders', async (event: DomainEvent) => {
  console.log('Processing order', event.payload);
  // your business logic here
});
```

---

## Tests

```bash
npm run test              # all tests
npm run test:unit         # domain + use-case unit tests
npm run test:integration  # HTTP integration tests (supertest)
npm run test:coverage     # with coverage report
```

---

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

---

## Docker

```bash
npm run docker:up      # start app + redis
npm run docker:down    # stop everything
npm run docker:logs    # follow logs

# Redis Commander UI (dev only)
docker-compose --profile dev up
# → http://localhost:8081
```

---

## License

MIT
