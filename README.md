<<<<<<< HEAD
# E-Commerce Order Pipeline

An event-driven order processing system that handles the complete order lifecycle: order creation → inventory reservation → payment authorization → shipping processing.

## What This Project Does

This is a **microservices-based order management system** that:

- **Creates orders** with customer and product information
- **Processes orders** through multiple stages (inventory → payment → shipping)
- **Tracks order status** in real-time with a visual timeline
- **Handles failures** with automatic retries and dead letter queues
- **Provides observability** with structured logging, metrics, and health checks
- **Supports manual retries** for failed orders
- **Implements event sourcing** to maintain a complete history of all order events

## Architecture

- **Frontend**: React + TypeScript dashboard showing order status and event timeline
- **Backend**: Node.js/Express API server handling order processing services
- **Database**: MongoDB storing orders, events, and idempotency keys
- **Realtime**: Socket.io WebSocket for live order updates
- **Event-Driven**: Services communicate via HTTP calls with correlation IDs
=======
Features
⚙️ Core Infrastructure

Structured JSON Logging with correlation IDs and levels

Schema Versioning and runtime validation
>>>>>>> 97ff8a8ddd5dba8066be6a4efbb08f4c62dcc71f

PII Minimization via SHA-256 hashing

<<<<<<< HEAD
**Quick Installation:**
=======
Exponential Backoff Retries with jitter

Metrics Collection for latency and success rates
>>>>>>> 97ff8a8ddd5dba8066be6a4efbb08f4c62dcc71f

Health Check Endpoints (/health, /ready, /live, /metrics)

JWT Authentication Utilities

<<<<<<< HEAD
**Note**: Docker is **optional**. MongoDB can run locally or use MongoDB Atlas (cloud).
=======
Docker Compose Setup for local Supabase stack
>>>>>>> 97ff8a8ddd5dba8066be6a4efbb08f4c62dcc71f

Makefile & Scripts for development automation

<<<<<<< HEAD
**Use your preferred IDE**

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies
npm install

# Step 4: Set up environment variables
# Create .env.local with your API URL (see README.md for details)

# Step 5: Start the development server
npm run dev
```

## Technologies Used

**Frontend:**
- React + TypeScript
- Vite
- shadcn/ui components
- Tailwind CSS
- Socket.io Client (WebSocket)

**Backend:**
- Node.js/Express API server
- MongoDB (Atlas or local)
- Event Sourcing pattern
- Saga pattern for compensation

**Features:**
- Idempotency handling
- Dead Letter Queue (DLQ)
- Automatic retries with exponential backoff
- Structured logging
- Health checks and metrics

## Author

**ANSH GUPTA**

## License

This project is private and proprietary.
=======
Client-Side Validation using Zod

WebSocket Client for real-time updates

Unit Tests for core utilities
>>>>>>> 97ff8a8ddd5dba8066be6a4efbb08f4c62dcc71f
