# KINGA ML Inference Microservices Architecture

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Executive Summary

This document defines the architecture for KINGA's ML inference microservices, which convert trained models into scalable production services. The architecture provides both REST and event-driven inference endpoints, supports model version selection from MLflow registry, implements auto-scaling based on request load, and integrates comprehensive logging and monitoring. Five independent microservices serve predictions for fraud detection, damage assessment, cost optimization, physics validation, and risk intelligence use cases.

---

## Architecture Overview

### Design Principles

The inference microservices architecture follows these core principles to ensure production readiness and operational excellence.

**Separation of Concerns** dictates that each model family operates as an independent microservice with its own deployment, scaling, and monitoring. This isolation prevents failures in one service from cascading to others and allows independent scaling based on usage patterns.

**API-First Design** ensures all services expose consistent REST APIs following OpenAPI specifications while also supporting event-driven inference for asynchronous batch processing. This dual-interface approach accommodates both synchronous real-time predictions and high-throughput batch scoring.

**Model Versioning** enables seamless model updates without service downtime. Services load models from MLflow registry and support version selection via API parameters, allowing A/B testing and gradual rollouts of new model versions.

**Observability** is built into every layer with structured logging, Prometheus metrics, distributed tracing, and health check endpoints. This comprehensive instrumentation enables rapid troubleshooting and performance optimization.

**Auto-Scaling** responds automatically to traffic patterns using Horizontal Pod Autoscaler based on CPU utilization and custom metrics like requests per second. This ensures cost efficiency during low traffic while maintaining performance during peaks.

### Service Architecture

Each inference microservice follows a standardized architecture pattern with four primary components.

**API Layer** handles HTTP requests using FastAPI framework, validates input schemas, manages model version selection, and returns predictions with confidence scores and metadata. The API implements rate limiting, request validation, and error handling to ensure reliability.

**Model Loader** retrieves model artifacts from MLflow registry, caches models in memory for fast inference, and supports hot-swapping of model versions without service restart. The loader monitors MLflow for new model versions and can automatically update to the latest production model.

**Inference Engine** executes model predictions using the appropriate framework (PyTorch, XGBoost, scikit-learn), handles batch prediction optimization, and implements request queuing for load management. The engine is optimized for low latency with pre-loaded models and efficient batch processing.

**Event Consumer** subscribes to Kafka topics for asynchronous inference requests, processes messages in batches for efficiency, publishes prediction results back to Kafka, and implements retry logic with dead-letter queues for failed predictions.

### Data Flow

The system supports two distinct inference patterns for different use cases.

**Synchronous REST Inference** follows this flow: Client sends POST request to `/predict` endpoint with input features and optional model version. Service validates request schema and loads the specified model version from cache or MLflow. Model executes prediction and returns JSON response with prediction, confidence score, model version used, and inference latency. Service logs request/response and publishes metrics to Prometheus.

**Asynchronous Event-Driven Inference** operates differently: Producer publishes inference request event to Kafka topic (e.g., `kinga.fraud-detection.inference-requests`). Inference service consumes events in batches of up to 100 messages. Service executes batch prediction for efficiency and publishes prediction results to response topic (e.g., `kinga.fraud-detection.inference-responses`). Consumer services receive predictions and update downstream systems.

---

## Service Specifications

### Fraud Detection Inference Service

**Purpose:** Provides real-time fraud risk scoring for insurance claims based on 45 engineered features.

**Model:** XGBoost binary classifier with Graph Neural Network for fraud ring detection, trained weekly, AUC-ROC target ≥ 0.92.

**API Endpoint:** `POST /api/v1/fraud-detection/predict`

**Request Schema:**
```json
{
  "claim_id": "string",
  "model_version": "string (optional, defaults to 'production')",
  "features": {
    "claim_amount": "number",
    "claim_age_days": "integer",
    "claimant_history_count": "integer",
    "vehicle_age_years": "number",
    "damage_severity_score": "number",
    "repair_cost_ratio": "number",
    "assessor_consistency_score": "number",
    // ... 38 additional features
  }
}
```

**Response Schema:**
```json
{
  "claim_id": "string",
  "prediction": {
    "is_fraudulent": "boolean",
    "fraud_probability": "number (0-1)",
    "fraud_risk_level": "string (low|medium|high|critical)",
    "fraud_indicators": ["string"],
    "fraud_ring_detected": "boolean",
    "fraud_ring_members": ["string"]
  },
  "model_metadata": {
    "model_name": "fraud-detection",
    "model_version": "string",
    "model_timestamp": "string (ISO 8601)"
  },
  "inference_metadata": {
    "inference_id": "string (UUID)",
    "inference_timestamp": "string (ISO 8601)",
    "inference_latency_ms": "number"
  }
}
```

**Kafka Topics:**
- Input: `kinga.fraud-detection.inference-requests`
- Output: `kinga.fraud-detection.inference-responses`

**Performance Targets:**
- Latency: p95 < 50ms, p99 < 100ms
- Throughput: 1000 requests/second per pod
- Availability: 99.9%

---

### Damage Detection Inference Service

**Purpose:** Analyzes vehicle damage images to estimate severity scores and identify damaged components.

**Model:** ResNet50 with custom regression head for severity scoring (0-100 scale), trained monthly, MAE target < 5 points.

**API Endpoint:** `POST /api/v1/damage-detection/predict`

**Request Schema:**
```json
{
  "assessment_id": "string",
  "model_version": "string (optional)",
  "images": [
    {
      "image_id": "string",
      "image_url": "string (S3 URL)",
      "image_type": "string (front|rear|side|detail)"
    }
  ],
  "vehicle_metadata": {
    "make": "string",
    "model": "string",
    "year": "integer"
  }
}
```

**Response Schema:**
```json
{
  "assessment_id": "string",
  "prediction": {
    "overall_severity_score": "number (0-100)",
    "total_estimated_cost": "number",
    "damaged_components": [
      {
        "component_name": "string",
        "damage_type": "string (scratch|dent|crack|break|missing)",
        "severity_score": "number (0-100)",
        "repair_recommendation": "string (repair|replace)",
        "estimated_cost": "number",
        "confidence": "number (0-1)"
      }
    ],
    "image_analysis": [
      {
        "image_id": "string",
        "detected_damages": ["string"],
        "bounding_boxes": [
          {
            "component": "string",
            "x": "number",
            "y": "number",
            "width": "number",
            "height": "number"
          }
        ]
      }
    ]
  },
  "model_metadata": { /* same structure */ },
  "inference_metadata": { /* same structure */ }
}
```

**Kafka Topics:**
- Input: `kinga.damage-detection.inference-requests`
- Output: `kinga.damage-detection.inference-responses`

**Performance Targets:**
- Latency: p95 < 200ms, p99 < 500ms (image processing overhead)
- Throughput: 100 requests/second per pod
- Availability: 99.9%

---

### Cost Optimization Inference Service

**Purpose:** Predicts optimal repair costs and identifies negotiation opportunities with panel beaters.

**Model:** LightGBM + Neural Network ensemble, trained monthly, R² target ≥ 0.85, MAPE target < 15%.

**API Endpoint:** `POST /api/v1/cost-optimization/predict`

**Request Schema:**
```json
{
  "quote_id": "string",
  "model_version": "string (optional)",
  "features": {
    "damaged_components": ["string"],
    "total_quote_amount": "number",
    "parts_cost": "number",
    "labor_cost": "number",
    "labor_hours": "number",
    "panel_beater_id": "string",
    "vehicle_make": "string",
    "vehicle_model": "string",
    "vehicle_year": "integer",
    "region": "string",
    "market_rate_parts": "number",
    "market_rate_labor": "number"
  }
}
```

**Response Schema:**
```json
{
  "quote_id": "string",
  "prediction": {
    "optimal_cost": "number",
    "cost_breakdown": {
      "parts_cost": "number",
      "labor_cost": "number",
      "overhead_cost": "number"
    },
    "negotiation_potential": {
      "savings_amount": "number",
      "savings_percentage": "number",
      "negotiation_priority": "string (low|medium|high)"
    },
    "market_comparison": {
      "quote_vs_market_parts": "number (percentage)",
      "quote_vs_market_labor": "number (percentage)",
      "panel_beater_pricing_tier": "string (budget|mid|premium)"
    },
    "recommendations": [
      {
        "component": "string",
        "recommendation": "string",
        "potential_saving": "number"
      }
    ]
  },
  "model_metadata": { /* same structure */ },
  "inference_metadata": { /* same structure */ }
}
```

**Kafka Topics:**
- Input: `kinga.cost-optimization.inference-requests`
- Output: `kinga.cost-optimization.inference-responses`

**Performance Targets:**
- Latency: p95 < 100ms, p99 < 200ms
- Throughput: 500 requests/second per pod
- Availability: 99.9%

---

### Physics Validation Inference Service

**Purpose:** Validates collision physics consistency between claimed impact and observed damage patterns.

**Model:** Neural Network + PyBullet simulation, trained quarterly, accuracy target ≥ 85%.

**API Endpoint:** `POST /api/v1/physics-validation/predict`

**Request Schema:**
```json
{
  "claim_id": "string",
  "model_version": "string (optional)",
  "collision_data": {
    "impact_speed_kmh": "number",
    "impact_angle_degrees": "number",
    "vehicle_mass_kg": "number",
    "impact_location": "string (front|rear|side)",
    "claimed_scenario": "string"
  },
  "damage_data": {
    "damaged_components": ["string"],
    "deformation_depth_mm": "number",
    "damage_pattern": "string"
  }
}
```

**Response Schema:**
```json
{
  "claim_id": "string",
  "prediction": {
    "physics_consistency_score": "number (0-100)",
    "is_consistent": "boolean",
    "inconsistencies": [
      {
        "type": "string",
        "description": "string",
        "severity": "string (minor|moderate|major)"
      }
    ],
    "simulation_results": {
      "expected_damage_pattern": "string",
      "expected_deformation_depth_mm": "number",
      "expected_impact_force_kn": "number"
    },
    "fraud_risk_indicator": "boolean"
  },
  "model_metadata": { /* same structure */ },
  "inference_metadata": { /* same structure */ }
}
```

**Kafka Topics:**
- Input: `kinga.physics-validation.inference-requests`
- Output: `kinga.physics-validation.inference-responses`

**Performance Targets:**
- Latency: p95 < 300ms, p99 < 600ms (simulation overhead)
- Throughput: 50 requests/second per pod
- Availability: 99.5%

---

### Risk Intelligence Inference Service

**Purpose:** Scores fleet risk and driver profiles based on telematics data and historical patterns.

**Model:** Random Forest + LSTM for time-series analysis, trained bi-weekly, accuracy target ≥ 80%.

**API Endpoint:** `POST /api/v1/risk-intelligence/predict`

**Request Schema:**
```json
{
  "entity_id": "string",
  "entity_type": "string (fleet|driver)",
  "model_version": "string (optional)",
  "features": {
    "telematics_data": {
      "avg_speed_kmh": "number",
      "harsh_braking_events": "integer",
      "harsh_acceleration_events": "integer",
      "night_driving_percentage": "number",
      "weekend_driving_percentage": "number",
      "total_distance_km": "number"
    },
    "historical_data": {
      "claims_count": "integer",
      "claims_total_cost": "number",
      "years_experience": "integer",
      "vehicle_age_years": "number"
    }
  }
}
```

**Response Schema:**
```json
{
  "entity_id": "string",
  "entity_type": "string",
  "prediction": {
    "risk_score": "number (0-100)",
    "risk_level": "string (low|medium|high|critical)",
    "risk_factors": [
      {
        "factor": "string",
        "contribution": "number (percentage)",
        "severity": "string"
      }
    ],
    "recommendations": ["string"],
    "predicted_claim_probability_12m": "number (0-1)",
    "predicted_claim_cost_12m": "number"
  },
  "model_metadata": { /* same structure */ },
  "inference_metadata": { /* same structure */ }
}
```

**Kafka Topics:**
- Input: `kinga.risk-intelligence.inference-requests`
- Output: `kinga.risk-intelligence.inference-responses`

**Performance Targets:**
- Latency: p95 < 150ms, p99 < 300ms
- Throughput: 200 requests/second per pod
- Availability: 99.9%

---

## Deployment Architecture

### Kubernetes Resources

Each inference service deploys as a Kubernetes Deployment with the following standard configuration.

**Deployment Specification** includes 3 initial replicas for high availability, resource requests of 1 CPU and 2GB memory per pod, resource limits of 2 CPU and 4GB memory to prevent resource exhaustion, liveness probe on `/health` endpoint with 30-second interval, readiness probe on `/ready` endpoint with 10-second interval, and rolling update strategy with max surge 1 and max unavailable 0 for zero-downtime deployments.

**Horizontal Pod Autoscaler** scales replicas based on CPU utilization target of 70%, custom metric of requests per second (target: 80% of max throughput), minimum 3 replicas for availability, and maximum 20 replicas for cost control. Scale-up occurs when metrics exceed targets for 30 seconds, while scale-down waits 5 minutes to prevent flapping.

**Service** exposes the deployment internally via ClusterIP service on port 8080 for REST API and port 9090 for Prometheus metrics. External access routes through API Gateway with authentication and rate limiting.

**ConfigMap** stores non-sensitive configuration including MLflow tracking URI, model name and default version, Kafka bootstrap servers and topic names, logging configuration, and feature engineering parameters.

**Secret** stores sensitive credentials including MLflow registry access token, Kafka SASL credentials, AWS credentials for S3 model artifacts, and Prometheus push gateway credentials.

### Auto-Scaling Strategy

Auto-scaling responds to multiple signals to balance performance and cost.

**CPU-Based Scaling** triggers when average CPU utilization across pods exceeds 70% for 30 seconds. This handles general load increases and prevents resource saturation.

**Custom Metrics Scaling** uses requests per second as a more direct indicator of service load. Each service defines a target RPS based on its throughput capacity (e.g., fraud detection targets 800 RPS per pod at 80% capacity).

**Scheduled Scaling** can pre-emptively increase replicas during known high-traffic periods such as Monday mornings when claim submissions peak. This prevents latency spikes during predictable load patterns.

**Scale-Down Delay** waits 5 minutes before removing pods to avoid rapid scaling oscillations. This stabilization period ensures traffic has genuinely decreased before reducing capacity.

### Model Version Management

Services support flexible model version selection to enable safe rollouts and A/B testing.

**Default Production Model** loads automatically on service startup by querying MLflow registry for the model in "Production" stage. This ensures services always serve the latest validated model without manual intervention.

**Version Pinning** allows clients to specify a model version in the request (e.g., `"model_version": "v2.3.1"`). The service loads the requested version from MLflow and caches it for subsequent requests. This enables A/B testing by routing different traffic segments to different model versions.

**Automatic Updates** can be configured to poll MLflow every 5 minutes and hot-swap to new production models without service restart. This reduces deployment friction for model updates.

**Version Caching** keeps the 3 most recently used model versions in memory to avoid repeated downloads from MLflow. Least-recently-used versions are evicted when memory pressure increases.

---

## Monitoring and Observability

### Prometheus Metrics

Each service exports standardized metrics for monitoring and alerting.

**Request Metrics** track `inference_requests_total` counter with labels for model name, version, and HTTP status code, `inference_request_duration_seconds` histogram with p50/p95/p99 quantiles, and `inference_batch_size` histogram for event-driven inference.

**Model Metrics** monitor `model_prediction_score` histogram of prediction values for distribution monitoring, `model_confidence_score` histogram of confidence scores, and `model_version_info` gauge indicating currently loaded model version.

**Resource Metrics** measure `model_load_duration_seconds` histogram for model loading latency, `model_memory_bytes` gauge of model memory footprint, and `inference_queue_length` gauge of pending requests.

**Error Metrics** count `inference_errors_total` counter with labels for error type (validation, prediction, timeout), `model_load_errors_total` counter for MLflow fetch failures, and `kafka_consumer_errors_total` counter for event processing failures.

### Structured Logging

Services emit JSON-formatted logs with consistent structure for centralized log aggregation.

**Log Fields** include `timestamp` in ISO 8601 format, `level` (DEBUG, INFO, WARNING, ERROR, CRITICAL), `service_name` and `service_version`, `inference_id` UUID for request tracing, `model_name` and `model_version` used for prediction, `latency_ms` for performance tracking, `request_payload` (sanitized), `response_payload` (sanitized), and `error_details` with stack traces for failures.

**Log Levels** follow this convention: DEBUG for detailed model loading and feature engineering steps, INFO for successful predictions and model version changes, WARNING for degraded performance or fallback to default model version, ERROR for prediction failures with retry logic, and CRITICAL for service startup failures or unrecoverable errors.

### Distributed Tracing

Services integrate with Jaeger for end-to-end request tracing across microservices.

**Trace Spans** instrument HTTP request handling, model loading from MLflow, feature preprocessing, model inference execution, Kafka message consumption and production, and downstream service calls.

**Trace Context Propagation** uses W3C Trace Context headers for REST API calls and Kafka message headers for event-driven flows. This enables correlation of predictions across multiple services in complex workflows.

---

## Security Considerations

### Authentication and Authorization

**API Authentication** requires JWT tokens issued by the Identity & Access Management service. Tokens include claims for user ID, organization ID, and granted permissions. Services validate tokens on every request and reject unauthorized access.

**Service-to-Service Authentication** uses mutual TLS (mTLS) for internal communication between microservices. Each service presents a certificate issued by the internal certificate authority, ensuring only authorized services can communicate.

**Model Access Control** restricts model loading to services with appropriate IAM roles. MLflow registry enforces read permissions, preventing unauthorized access to model artifacts.

### Data Protection

**Input Sanitization** validates all request payloads against JSON schemas to prevent injection attacks. Services reject malformed requests before processing.

**PII Redaction** automatically removes personally identifiable information from logs and metrics. Claim IDs and entity IDs are hashed before logging to protect privacy.

**Encryption in Transit** enforces TLS 1.3 for all external API calls and mTLS for internal service communication. Kafka messages are encrypted using SASL_SSL protocol.

**Encryption at Rest** stores model artifacts in S3 with server-side encryption (SSE-S3). MLflow backend database uses encrypted RDS volumes.

---

## Conclusion

This inference microservices architecture provides production-ready ML serving with high availability, auto-scaling, comprehensive monitoring, and security-by-design. The standardized approach across all five model families simplifies operations while allowing service-specific optimizations. By supporting both REST and event-driven inference patterns, the architecture accommodates diverse use cases from real-time fraud detection to batch risk scoring.

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-11 | Tavonga Shoko | Initial inference architecture specification |
