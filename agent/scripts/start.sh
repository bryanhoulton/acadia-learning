#!/bin/bash

# Kill any existing Python processes running the agent
pkill -f "python main.py dev" 2>/dev/null

# Start the agent in development mode
uv run python main.py dev 