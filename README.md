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

## Quick Start

**Quick Installation:**

```sh
# Install dependencies (fixes peer dependency conflicts automatically)
npm install

# Start development server
npm run dev
```

**Note**: Docker is **optional**. MongoDB can run locally or use MongoDB Atlas (cloud).

## How can I edit this code?

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
