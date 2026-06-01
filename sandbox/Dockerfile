FROM e2b-dev/code-interpreter:latest

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    build-essential \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Python packages
RUN pip install --upgrade pip
RUN pip install anthropic pytest pytest-cov pydantic
