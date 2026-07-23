# Job Application AI

A local-first AI job discovery and application assistant for Mark John B. Matining.

## Overview
This project automates job discovery, resume tailoring, and application tracking using a local-first architecture to ensure data privacy and full control over candidate information.

## Tech Stack
- **Monorepo**: pnpm + Turborepo
- **Database**: SQLite (WAL mode) with Drizzle ORM
- **Scheduling**: Trigger.dev
- **Dashboard**: Next.js
- **Testing**: Vitest
- **Validation**: Zod

## Quick Start
1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Start development servers:
   ```bash
   pnpm dev
   ```

## Development Commands
- `pnpm dev`: Start development servers
- `pnpm build`: Build the project
- `pnpm test`: Run tests

## Documentation
For detailed documentation, please refer to the [docs/](docs/) directory.
