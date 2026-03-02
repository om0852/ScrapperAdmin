#!/bin/bash

# Quick Setup Script for macOS and Linux
# This script installs all dependencies and sets up the server environment

echo ""
echo "========================================"
echo "Quick Commerce Server Setup Script"
echo "========================================"
echo ""

cd mainserver

platforms=("blinkit" "dmart" "flipkart" "instamart" "jiomart" "zepto")
total=$((${#platforms[@]} + 1))
current=1

echo "[$current/$total] Installing Main Server Dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Error installing main server dependencies"
    exit 1
fi

for platform in "${platforms[@]}"; do
    current=$((current + 1))
    echo ""
    echo "[$current/$total] Installing $platform dependencies..."
    cd "$platform"
    npm install
    if [ $? -ne 0 ]; then
        echo "Error installing $platform dependencies"
        exit 1
    fi
    cd ..
done

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next Steps:"
echo "1. Run: npm start"
echo "2. Open: http://localhost:3000"
echo "3. Start your platform servers from the UI"
echo ""
