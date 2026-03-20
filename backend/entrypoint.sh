#!/bin/sh
set -e

echo "Running seed script..."
npx tsx src/db/seed.ts

echo "Starting server..."
exec node dist/index.js
