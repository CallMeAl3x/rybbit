#!/bin/sh

if [ "$MODE" = "client" ]; then
    echo "Starting in CLIENT mode..."
    cd /app/client
    export NODE_ENV=production
    export NEXT_TELEMETRY_DISABLED=1
    exec su-exec nextjs node server.js
elif [ "$MODE" = "server" ]; then
    echo "Starting in SERVER mode..."
    cd /app/server
    exec /docker-entrypoint.sh node dist/index.js
else
    echo "ERROR: MODE environment variable must be set to either 'client' or 'server'"
    exit 1
fi