FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Cài Node.js (để test code TS/JS)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

WORKDIR /app
RUN pip3 install claude-agent-sdk

# File run_dev.py sẽ được mount/push vào lúc runtime
CMD ["python3", "/app/run_dev.py"]
