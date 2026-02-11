FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install MLflow and dependencies
RUN pip install --no-cache-dir \
    mlflow==2.10.2 \
    psycopg2-binary==2.9.9 \
    boto3==1.34.34 \
    pymysql==1.1.0

# Create mlflow user
RUN useradd -m -u 1000 mlflow && \
    mkdir -p /mlflow && \
    chown -R mlflow:mlflow /mlflow

USER mlflow
WORKDIR /mlflow

# Expose MLflow port
EXPOSE 5000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Start MLflow server
CMD ["mlflow", "server", \
     "--host", "0.0.0.0", \
     "--port", "5000", \
     "--backend-store-uri", "${MLFLOW_BACKEND_STORE_URI}", \
     "--default-artifact-root", "${MLFLOW_DEFAULT_ARTIFACT_ROOT}"]
