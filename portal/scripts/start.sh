#!/bin/bash

# Kill any existing process on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Start the development server
yarn dev 