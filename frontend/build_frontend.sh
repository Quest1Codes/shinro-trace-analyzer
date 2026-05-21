#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installing frontend dependencies..."
bun install

echo "Building frontend (bundle + minify + obfuscate)..."
bunx vite build --config vite.build.config.ts

echo "Frontend build complete -> frontend/build/"
