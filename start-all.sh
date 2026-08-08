#!/bin/bash
echo "🚀 Starting BuildOS..."

# Kill anything on our ports first
fuser -k 3001/tcp 3002/tcp 8080/tcp 2>/dev/null

# Start compiler
cd ~/buildos/compiler && node server.js &
echo "✅ Compiler running on :3001"

# Start signal monitor
cd ~/buildos/signal-monitor && node server.js &
echo "✅ Signal Monitor running on :3002"

# Start frontend
cd ~/buildos && python3 -m http.server 8080 --directory frontend &
echo "✅ Frontend running on :8080"

echo ""
echo "BuildOS is live. Open port 8080 in the Ports tab."
echo "Press Ctrl+C to stop all servers."

wait
