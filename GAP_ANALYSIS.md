# Gap Analysis: Event-Driven E-Commerce Order Pipeline

## Executive Summary

The current implementation uses **Supabase Edge Functions (Deno)** with **PostgreSQL** and **direct HTTP calls**, while the requirements specify **Node.js services** with **Kafka** and **MongoDB**. This is a fundamental architectural mismatch requiring significant refactoring.

---

## 🔴 CRITICAL GAPS (Architecture Mismatch)

### 1. **Messaging Infrastructure**
❌ **Missing**: Kafka for asynchronous event processing
- **Current**: Direct HTTP `fetch()` calls between Supabase Edge Functions
- **Required**: Kafka topics partitioned by `orderId`, producer/consumer groups, delivery guarantees
- **Impact**: No proper message queue, no ordering guarantees, no scalable parallel processing

### 2. **Backend Services Architecture**
❌ **Missing**: Node.js Express services (separate services per domain)
- **Current**: Supabase Edge Functions (Deno) - monolithic functions
- **Required**: 
  - Separate Node.js services: `order-service`, `inventory-service`, `payment-service`, `shipping-service`
  - Express.js for admin/status endpoints
  - No shared database tables (each service owns its data)
- **Impact**: Cannot scale services independently, tightly coupled

### 3. **Database Technology**
❌ **Missing**: MongoDB for state persistence
- **Current**: PostgreSQL (Supabase)
- **Required**: 
  - MongoDB aggregates per order
  - Append-only event log for audit
  - TTL for transient topics
- **Impact**: Different data model, different query patterns

### 4. **Real-time Communication**
❌ **Missing**: WebSocket or Server-Sent Events (SSE)
- **Current**: Supabase Realtime (PostgreSQL change streams)
- **Required**: WebSocket/SSE from a read model service
- **Impact**: Different real-time architecture

---

## 🟡 MAJOR GAPS (Functionality)

### 5. **Idempotency & Exactly-Once Semantics**
⚠️ **Partial**: Basic idempotency exists but not Kafka-level
- **Current**: Database-level idempotency keys
- **Missing**:
  - Dedupe store for Kafka messages
  - Atomic writes with outbox pattern
  - Producer idempotency configuration
  - Consumer idempotency handling for out-of-order events

### 6. **Retry Mechanism**
⚠️ **Partial**: Basic retry exists but not Kafka-native
- **Current**: Manual retry via API call
- **Missing**:
  - Exponential backoff in Kafka consumers
  - Per-event max attempts configuration
  - Automatic retry with DLQ topics (not just database table)
  - Operator tools for replaying DLQ messages

### 7. **Event Schema Versioning**
❌ **Missing**: Versioned event schemas
- **Current**: Events have version field but no schema registry
- **Required**: Schema versioning for backward compatibility, schema registry (Confluent/Apache Schema Registry)

### 8. **Kafka Partitioning & Ordering**
❌ **Missing**: Kafka-specific features
- **Required**:
  - Partition by `orderId` for ordering guarantees
  - Consumer groups for parallel processing
  - Producer configuration (acks, retries, idempotence)
  - Consumer offset management

### 9. **Saga/Compensation Pattern**
⚠️ **Partial**: Basic compensation exists
- **Current**: Payment failure triggers inventory release
- **Missing**:
  - Full saga orchestration
  - Compensation on shipping failure (refund)
  - Compensation event tracking
  - Saga state machine

---

## 🟠 SECURITY & VALIDATION GAPS

### 10. **JWT Authentication**
❌ **Missing**: JWT-protected endpoints
- **Current**: No authentication (public Supabase functions)
- **Required**: 
  - JWT middleware for Express services
  - Protected admin endpoints
  - Protected query endpoints
  - Token validation

### 11. **Payload Validation**
❌ **Missing**: Schema validation (Zod/Joi)
- **Current**: Basic TypeScript types, no runtime validation
- **Required**: 
  - Zod or Joi schemas for all event payloads
  - Request validation middleware
  - Event schema validation before Kafka publish

### 12. **PII Minimization**
❌ **Missing**: PII minimization in events
- **Current**: Full customer name in events
- **Required**: 
  - Hash or tokenize customer data
  - PII scrubbing in event payloads
  - Data retention policies

---

## 🔵 OBSERVABILITY GAPS

### 13. **Structured Logging**
❌ **Missing**: JSON structured logs
- **Current**: `console.log()` statements
- **Required**: 
  - JSON logging format
  - Correlation ID in all logs
  - Log levels (debug, info, warn, error)
  - Contextual logging

### 14. **Distributed Tracing**
❌ **Missing**: Distributed tracing with correlation IDs
- **Current**: Correlation IDs exist but not used for tracing
- **Required**: 
  - OpenTelemetry or similar
  - Trace propagation across services
  - Span creation for each service call
  - Trace visualization

### 15. **Metrics**
❌ **Missing**: Metrics collection
- **Required**:
  - Kafka consumer lag metrics
  - Latency metrics (p99, p95)
  - Throughput metrics (events/sec)
  - Error rate metrics
  - Prometheus or similar

### 16. **Health Checks**
❌ **Missing**: Health check endpoints
- **Required**:
  - `/health` endpoint per service
  - Consumer health (connected to Kafka, processing messages)
  - Database connectivity health
  - Kafka connectivity health

---

## 🟢 TESTING GAPS

### 17. **Unit Tests**
❌ **Missing**: Unit tests for services
- **Required**: Jest/Vitest tests for business logic

### 18. **Integration Tests**
❌ **Missing**: Integration tests
- **Required**: Tests for service interactions via Kafka

### 19. **Contract Tests**
❌ **Missing**: Event schema contract tests
- **Required**: 
  - Schema compatibility tests
  - Consumer-driven contracts
  - Event payload validation tests

### 20. **Chaos Tests**
❌ **Missing**: Chaos engineering tests
- **Required**:
  - Tests for dropped messages
  - Tests for duplicate messages
  - Tests for late/out-of-order messages
  - Network partition tests
  - Service failure tests

---

## 🟣 DEVOPS & INFRASTRUCTURE GAPS

### 21. **Docker Compose**
❌ **Missing**: Docker Compose setup
- **Required**:
  - Kafka + Zookeeper containers
  - Kafka UI (Kafdrop/UI for Apache Kafka)
  - MongoDB container
  - All Node.js services as containers
  - Network configuration
  - Volume mounts for data persistence

### 22. **Local Development Scripts**
❌ **Missing**: Make/npm scripts for one-shot bring-up
- **Required**:
  - `make up` or `npm run start:all`
  - `make down` for cleanup
  - `make seed` for seed data
  - `make test` for running tests
  - Service-specific scripts

### 23. **Environment Configuration**
⚠️ **Partial**: Basic env vars exist
- **Missing**: 
  - Kafka broker URLs
  - MongoDB connection strings
  - JWT secrets
  - Service ports
  - Environment-specific configs

---

## 📊 SUMMARY TABLE

| Category | Requirement | Current Status | Gap Severity |
|----------|------------|----------------|--------------|
| **Messaging** | Kafka with partitions | HTTP calls | 🔴 CRITICAL |
| **Services** | Node.js Express services | Deno Edge Functions | 🔴 CRITICAL |
| **Database** | MongoDB | PostgreSQL | 🔴 CRITICAL |
| **Real-time** | WebSocket/SSE | Supabase Realtime | 🔴 CRITICAL |
| **Idempotency** | Kafka-level + outbox | Database only | 🟡 MAJOR |
| **Retries** | Exponential backoff + DLQ topics | Manual retry | 🟡 MAJOR |
| **Schema** | Versioned schemas | Basic version field | 🟡 MAJOR |
| **Saga** | Full orchestration | Basic compensation | 🟡 MAJOR |
| **Security** | JWT + validation | None | 🟠 IMPORTANT |
| **Logging** | Structured JSON | console.log | 🟠 IMPORTANT |
| **Tracing** | Distributed tracing | None | 🟠 IMPORTANT |
| **Metrics** | Prometheus metrics | None | 🟠 IMPORTANT |
| **Tests** | Unit/Integration/Contract/Chaos | None | 🟠 IMPORTANT |
| **Docker** | Docker Compose | None | 🟠 IMPORTANT |

---

## 🎯 RECOMMENDED MIGRATION PATH

### Phase 1: Infrastructure Setup
1. Create Docker Compose with Kafka + MongoDB
2. Set up Kafka topics and partitions
3. Create base Node.js service templates

### Phase 2: Service Migration
1. Migrate `create-order` → `order-service` (Node.js + Express)
2. Migrate `process-inventory` → `inventory-service`
3. Migrate `process-payment` → `payment-service`
4. Migrate `process-shipping` → `shipping-service`

### Phase 3: Kafka Integration
1. Replace HTTP calls with Kafka producers
2. Implement Kafka consumers in each service
3. Set up consumer groups and partitioning

### Phase 4: MongoDB Migration
1. Design MongoDB schema (aggregates + event log)
2. Migrate data from PostgreSQL
3. Update all services to use MongoDB

### Phase 5: Enhanced Features
1. Add JWT authentication
2. Implement structured logging + tracing
3. Add metrics collection
4. Set up WebSocket/SSE for real-time

### Phase 6: Testing & Observability
1. Write unit/integration tests
2. Add contract tests
3. Implement chaos tests
4. Set up monitoring dashboards

---

## 📝 NOTES

- **Current Implementation**: Good foundation with event sourcing, idempotency, DLQ, and basic compensation
- **Architecture Gap**: Fundamental difference between serverless functions vs. microservices
- **Database Migration**: PostgreSQL → MongoDB requires schema redesign (relational → document)
- **Real-time**: Supabase Realtime works but needs WebSocket/SSE implementation for requirements
- **Testing**: Zero test coverage currently - needs comprehensive test suite


