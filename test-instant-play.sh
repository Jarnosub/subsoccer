#!/bin/bash

# Quick test script for Instant Play mode
# Run this to test locally before deploying

echo "⚽ SUBSOCCER INSTANT PLAY - Local Test"
echo "======================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3."
    exit 1
fi

# Get local IP
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ipconfig getifaddr en0)
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ipconfig getifaddr en1)
    fi
else
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
    echo "⚠️  Could not detect IP address, using localhost"
fi

echo "🌐 Starting local server..."
echo "📱 Access from phone: http://$LOCAL_IP:8000/instant-play.html"
echo ""
echo "🔍 Scan this URL with your phone's camera:"
echo "   http://$LOCAL_IP:8000/instant-play.html"
echo ""
echo "💡 To generate QR code:"
echo "   python3 generate_qr.py http://$LOCAL_IP:8000/instant-play.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo "======================================="
echo ""

# Start Python HTTP server
python3 -m http.server 8000
