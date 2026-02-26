#!/bin/bash

# Function to check if a port is in use
check_port() {
    lsof -i :$1 > /dev/null
    return $?
}

echo "--- Starting Services for Demo 3 ---"

# 1. Start Redis
if check_port 6379; then
    echo "✅ Redis is already running on port 6379."
else
    echo "🚀 Starting Redis..."
    if brew list redis &>/dev/null; then
        brew services start redis
    else
        redis-server --daemonize yes
    fi
    echo "Waiting for Redis..."
    sleep 2
fi

# 2. Start RabbitMQ
if check_port 5672; then
    echo "✅ RabbitMQ is already running on port 5672."
else
    echo "🚀 Starting RabbitMQ..."
    brew services start rabbitmq
    echo "Waiting for RabbitMQ..."
    sleep 5
fi

# 3. Start Elasticsearch
if check_port 9200; then
    echo "✅ Elasticsearch is already running on port 9200."
else
    echo "🚀 Starting Elasticsearch..."
    # Set Java Home to OpenJDK 17 to bypass SecurityManager issues in Java 24+
    export ES_JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
    
    # Run in background, disable ML to avoid native code issues on macOS
    nohup /opt/homebrew/opt/elasticsearch-full/bin/elasticsearch -Expack.ml.enabled=false > elasticsearch.log 2>&1 &
    
    echo "Waiting for Elasticsearch to initialize (this may take 30s)..."
    # Hardware/Startup dependent wait loop
    count=0
    while ! check_port 9200; do
        sleep 2
        count=$((count+2))
        if [ $count -gt 60 ]; then
             echo "⚠️ Elasticsearch startup timed out. Check elasticsearch.log."
             break
        fi
        echo -n "."
    done
    echo ""
    echo "✅ Elasticsearch started."
fi

# 4. Start Node Server
if check_port 8000; then
    echo "⚠️  Port 8000 is in use. Killing existing process..."
    kill -9 $(lsof -t -i :8000)
    sleep 2
fi

echo "🚀 Starting Node Server..."
npm start
