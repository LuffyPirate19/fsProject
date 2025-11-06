# Setup Guide

## Prerequisites

### Required
- **Node.js** (v18 or higher)
- **npm** or **yarn**

### Optional (for local Supabase)
- **Docker Desktop** (for running Supabase locally)
  - Download: https://www.docker.com/products/docker-desktop
  - Or use **Supabase CLI** (alternative to Docker)

## Installation

### 1. Install Dependencies

```bash
npm install
```

If you encounter dependency conflicts, use:

```bash
npm install --legacy-peer-deps
```

### 2. Environment Setup

Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

For local development with Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# This will output your local credentials
```

## Running the Project

### Option 1: Using Supabase Cloud (Recommended for Quick Start)

1. Set up your `.env.local` with Supabase cloud credentials
2. Run the dev server:

```bash
npm run dev
```

### Option 2: Using Supabase CLI (No Docker Required)

```bash
# Start Supabase locally
supabase start

# Copy the credentials from the output to .env.local
# Then run:
npm run dev
```

### Option 3: Using Docker Compose

**Note**: Docker is optional. If you don't have Docker installed, use Option 2 above.

```bash
# Start Docker services
make up
# or
npm run docker:up

# Wait for services to start, then:
npm run dev
```

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint
```

## Docker Commands (Optional)

```bash
# Start all services
make up
# or: npm run docker:up

# Stop all services
make down
# or: npm run docker:down

# View logs
make logs
# or: npm run docker:logs

# Clean up (remove volumes)
make clean
# or: npm run docker:clean
```

## Troubleshooting

### Dependency Conflicts

If you see `ERESOLVE` errors:

```bash
npm install --legacy-peer-deps
```

### Docker Not Found

If Docker is not installed or not in PATH:
- Use **Supabase CLI** instead (see Option 2 above)
- Or install Docker Desktop: https://www.docker.com/products/docker-desktop

### Port Already in Use

If port 8080 is already in use:
- Change the port in `vite.config.ts`:
  ```ts
  server: {
    port: 8081, // or any other available port
  }
  ```

### Supabase Connection Issues

1. Check your `.env.local` file has correct credentials
2. Verify Supabase project is active
3. For local Supabase: ensure `supabase start` completed successfully

## Health Checks

Once running, test the health endpoint:

```bash
# Using Supabase cloud
curl https://your-project.supabase.co/functions/v1/health

# Using local Supabase
curl http://localhost:54321/functions/v1/health
```

## Next Steps

1. ✅ Install dependencies
2. ✅ Set up environment variables
3. ✅ Start development server
4. ✅ Visit http://localhost:8080

For more information, see:
- `README.md` - Project overview
- `README_IMPLEMENTATION.md` - Implementation details
- `GAP_ANALYSIS.md` - Requirements analysis


