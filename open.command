#!/bin/bash
cd "$(dirname "$0")"
PORT=8766
lsof -ti:$PORT | xargs kill -9 2>/dev/null
python3 -m http.server $PORT &>/dev/null &
SERVER_PID=$!
sleep 0.3
open -a "Google Chrome" "http://localhost:$PORT"
wait $SERVER_PID
