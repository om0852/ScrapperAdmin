#!/bin/bash

# Deploy script for XtraSecurity.in platform
# Usage: ./deploy-xtra.sh

set -e

echo ""
echo "=========================================="
echo "XtraSecurity Deployment Script"
echo "=========================================="
echo ""

# Check if xtra CLI is installed
if ! command -v xtra &> /dev/null; then
    echo "❌ XtraSecurity CLI not found."
    echo "Install it from: https://docs.xtrasecurity.in"
    exit 1
fi

# Check if logged in
if ! xtra status &> /dev/null; then
    echo "❌ Not logged into XtraSecurity"
    echo "Run: xtra login"
    exit 1
fi

echo "✅ XtraSecurity CLI ready"
echo ""

# Step 1: Ensure secrets are set
echo "Step 1: Setting up secrets..."
echo ""
echo "Enter your MongoDB URI:"
read -p "MONGODB_URI: " MONGODB_URI

if [ -z "$MONGODB_URI" ]; then
    echo "❌ MongoDB URI cannot be empty"
    exit 1
fi

echo ""
echo "Setting secret in XtraSecurity..."
xtra secret set MONGODB_URI "$MONGODB_URI"

echo "✅ Secret set!"
echo ""

# Step 2: Build Docker image
echo "Step 2: Building Docker image..."
docker build -t quickcommerce-mainserver:latest .
echo "✅ Docker image built!"
echo ""

# Step 3: Tag for XtraSecurity registry (optional)
echo "Step 3: Preparing for deployment..."
echo "(Tagging Docker image)"
docker tag quickcommerce-mainserver:latest quickcommerce-mainserver:production
echo "✅ Image tagged!"
echo ""

# Step 4: Deploy
echo "Step 4: Deploying to XtraSecurity..."
echo ""
echo "Running: xtra run npm start"
echo ""
xtra run npm start

echo ""
echo "=========================================="
echo "✅ Deployment initiated!"
echo "=========================================="
echo ""
echo "Monitor logs:"
echo "  xtra logs -f"
echo ""
echo "Check status:"
echo "  xtra status"
echo ""
echo "Access your app at:"
echo "  https://your-project.xtrasecurity.in"
echo ""
