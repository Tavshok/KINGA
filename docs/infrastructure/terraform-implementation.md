# KINGA Infrastructure-as-Code Implementation

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Terraform Modules](#terraform-modules)
4. [AWS CDK Implementation](#aws-cdk-implementation)
5. [Deployment Guide](#deployment-guide)
6. [Cost Optimization](#cost-optimization)
7. [Security & Compliance](#security--compliance)
8. [Monitoring & Observability](#monitoring--observability)

---

## Executive Summary

This document provides comprehensive Infrastructure-as-Code (IaC) for deploying KINGA's microservices architecture on AWS. The implementation includes Terraform modules for all infrastructure components and an alternative AWS CDK implementation, ensuring production-ready deployment with security, scalability, and cost optimization.

**Infrastructure Components:**

- **Compute**: Amazon EKS cluster with managed node groups
- **Database**: Amazon RDS PostgreSQL (11 separate databases)
- **Event Streaming**: Amazon MSK (Managed Kafka)
- **Storage**: Amazon S3 (data lake, backups, static assets)
- **API Gateway**: AWS API Gateway with Lambda authorizers
- **Networking**: VPC with public/private/database subnets across 3 AZs
- **Security**: IAM roles, security groups, KMS encryption
- **Monitoring**: CloudWatch logs, metrics, alarms, X-Ray tracing

**Key Features:**

✅ **Multi-environment support** (dev, staging, prod)  
✅ **High availability** across 3 availability zones  
✅ **Auto-scaling** for EKS nodes and RDS  
✅ **Security-by-design** with least privilege IAM  
✅ **Cost optimization** with spot instances and reserved capacity  
✅ **Disaster recovery** with automated backups  
✅ **Compliance** with encryption at rest and in transit  

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud (Region)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    VPC (10.0.0.0/16)                      │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │ Public AZ1 │  │ Public AZ2 │  │ Public AZ3 │         │  │
│  │  │ NAT GW     │  │ NAT GW     │  │ NAT GW     │         │  │
│  │  │ ALB        │  │ ALB        │  │ ALB        │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │ Private AZ1│  │ Private AZ2│  │ Private AZ3│         │  │
│  │  │ EKS Nodes  │  │ EKS Nodes  │  │ EKS Nodes  │         │  │
│  │  │ MSK Broker │  │ MSK Broker │  │ MSK Broker │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │Database AZ1│  │Database AZ2│  │Database AZ3│         │  │
│  │  │ RDS Primary│  │ RDS Standby│  │ RDS Replica│         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Gateway → Lambda Authorizer → EKS Services          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  S3 Buckets: Data Lake, Backups, Static Assets           │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CloudWatch: Logs, Metrics, Alarms, Dashboards           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Network Architecture

**VPC CIDR**: 10.0.0.0/16

**Subnets:**
- Public subnets: 10.0.0.0/20, 10.0.16.0/20, 10.0.32.0/20 (NAT GW, ALB)
- Private subnets: 10.0.48.0/20, 10.0.64.0/20, 10.0.80.0/20 (EKS, MSK)
- Database subnets: 10.0.96.0/20, 10.0.112.0/20, 10.0.128.0/20 (RDS)

**Connectivity:**
- Internet Gateway for public subnets
- NAT Gateways (3) for private subnet internet access
- VPC Endpoints for S3, ECR (reduce NAT costs)
- VPC Peering for cross-region disaster recovery

---

## Terraform Modules

### Module Structure

```
infrastructure/terraform/
├── modules/
│   ├── vpc/                 # VPC, subnets, NAT gateways
│   ├── eks/                 # EKS cluster, node groups
│   ├── rds/                 # RDS PostgreSQL instances
│   ├── msk/                 # Managed Kafka cluster
│   ├── s3/                  # S3 buckets with policies
│   ├── api-gateway/         # API Gateway, Lambda authorizers
│   ├── iam/                 # IAM roles, policies
│   └── monitoring/          # CloudWatch, X-Ray
├── environments/
│   ├── dev/                 # Dev environment config
│   ├── staging/             # Staging environment config
│   └── prod/                # Production environment config
└── README.md
```

### 1. VPC Module

**Location:** `infrastructure/terraform/modules/vpc/`

**Features:**
- Multi-AZ VPC with 3 availability zones
- Public, private, and database subnet tiers
- NAT Gateways for private subnet internet access
- VPC Flow Logs for network monitoring
- VPC Endpoints for S3 and ECR (cost optimization)

**Usage:**

```hcl
module "vpc" {
  source = "../../modules/vpc"

  environment        = "prod"
  aws_region         = "us-east-1"
  vpc_cidr           = "10.0.0.0/16"
  cluster_name       = "kinga-prod-eks"
  enable_nat_gateway = true
  single_nat_gateway = false  # Use 3 NAT GWs for HA in prod
  enable_flow_logs   = true

  tags = {
    Project     = "KINGA"
    Environment = "production"
    ManagedBy   = "Terraform"
  }
}
```

**Outputs:**
- `vpc_id` - VPC ID
- `public_subnet_ids` - Public subnet IDs
- `private_subnet_ids` - Private subnet IDs
- `database_subnet_ids` - Database subnet IDs

### 2. EKS Module

**Location:** `infrastructure/terraform/modules/eks/`

**Features:**
- EKS cluster with managed control plane
- Managed node groups with auto-scaling
- Spot instances for cost optimization
- IRSA (IAM Roles for Service Accounts)
- Cluster autoscaler
- AWS Load Balancer Controller

**Configuration:**

```hcl
module "eks" {
  source = "../../modules/eks"

  environment    = "prod"
  cluster_name   = "kinga-prod-eks"
  cluster_version = "1.28"

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  # Node groups
  node_groups = {
    general = {
      desired_size = 3
      min_size     = 3
      max_size     = 10
      instance_types = ["t3.large", "t3a.large"]
      capacity_type  = "ON_DEMAND"
      labels = {
        workload = "general"
      }
    }
    compute = {
      desired_size = 2
      min_size     = 2
      max_size     = 20
      instance_types = ["c5.xlarge", "c5a.xlarge"]
      capacity_type  = "SPOT"
      labels = {
        workload = "compute-intensive"
      }
      taints = [{
        key    = "workload"
        value  = "compute"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  # Enable cluster add-ons
  enable_cluster_autoscaler = true
  enable_metrics_server     = true
  enable_aws_load_balancer_controller = true

  tags = local.tags
}
```

**Key Resources:**
- EKS Cluster
- Managed Node Groups (general, compute, memory-optimized)
- IAM Roles for Nodes and Pods
- Security Groups
- Cluster Add-ons (VPC CNI, CoreDNS, kube-proxy)

### 3. RDS Module

**Location:** `infrastructure/terraform/modules/rds/`

**Features:**
- PostgreSQL 15 with Multi-AZ deployment
- Automated backups with point-in-time recovery
- Read replicas for scaling
- Enhanced monitoring
- Encryption at rest (KMS)
- Automated minor version upgrades

**Configuration:**

```hcl
# Create 11 separate RDS instances for microservices
locals {
  databases = [
    "identity",
    "claim-intake",
    "ai-damage",
    "fraud-detection",
    "cost-optimization",
    "workflow",
    "fleet-risk",
    "insurer-integration",
    "notification",
    "ml-features",
    "event-store"
  ]
}

module "rds" {
  source   = "../../modules/rds"
  for_each = toset(local.databases)

  environment     = "prod"
  database_name   = "${each.key}-db"
  engine_version  = "15.4"
  instance_class  = each.key == "ml-features" ? "db.r6g.2xlarge" : "db.t4g.large"

  vpc_id             = module.vpc.vpc_id
  database_subnet_ids = module.vpc.database_subnet_ids

  # High availability
  multi_az               = true
  create_read_replica    = each.key == "claim-intake" || each.key == "fraud-detection"
  read_replica_count     = 1

  # Storage
  allocated_storage     = each.key == "ml-features" ? 500 : 100
  max_allocated_storage = each.key == "ml-features" ? 2000 : 500
  storage_encrypted     = true

  # Backups
  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Performance Insights
  performance_insights_enabled = true
  performance_insights_retention_period = 7

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60

  tags = local.tags
}
```

**Key Features:**
- Separate RDS instance per microservice database
- Multi-AZ for high availability
- Read replicas for read-heavy workloads
- Automated backups with 30-day retention
- Performance Insights for query optimization

### 4. MSK (Managed Kafka) Module

**Location:** `infrastructure/terraform/modules/msk/`

**Features:**
- Multi-AZ Kafka cluster
- SASL/SCRAM authentication
- TLS encryption in transit
- CloudWatch monitoring
- Auto-scaling storage

**Configuration:**

```hcl
module "msk" {
  source = "../../modules/msk"

  environment    = "prod"
  cluster_name   = "kinga-prod-kafka"
  kafka_version  = "3.5.1"

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  # Broker configuration
  number_of_broker_nodes = 3
  broker_instance_type   = "kafka.m5.large"

  # Storage
  ebs_volume_size = 500

  # Security
  client_authentication = "SASL_SCRAM"
  encryption_in_transit = "TLS"

  # Monitoring
  cloudwatch_logs_enabled = true
  jmx_exporter_enabled    = true
  node_exporter_enabled   = true

  tags = local.tags
}
```

**Topics Created:**
- `kinga.claims.submitted`
- `kinga.assessments.completed`
- `kinga.fraud.detected`
- `kinga.quotes.submitted`
- `kinga.workflows.updated`
- `kinga.notifications.send`
- `kinga.events.dlq`

### 5. S3 Module

**Location:** `infrastructure/terraform/modules/s3/`

**Features:**
- Multiple S3 buckets for different purposes
- Versioning enabled
- Lifecycle policies for cost optimization
- Server-side encryption (SSE-S3 or KMS)
- Access logging
- CORS configuration for web uploads

**Configuration:**

```hcl
module "s3" {
  source = "../../modules/s3"

  environment = "prod"

  buckets = {
    data-lake = {
      versioning_enabled = true
      lifecycle_rules = [
        {
          id      = "archive-old-data"
          enabled = true
          transition = {
            days          = 90
            storage_class = "GLACIER"
          }
        }
      ]
    }
    backups = {
      versioning_enabled = true
      lifecycle_rules = [
        {
          id      = "expire-old-backups"
          enabled = true
          expiration = {
            days = 90
          }
        }
      ]
    }
    static-assets = {
      versioning_enabled = false
      cors_enabled       = true
      cloudfront_enabled = true
    }
    damage-photos = {
      versioning_enabled = true
      cors_enabled       = true
      lifecycle_rules = [
        {
          id      = "move-to-ia"
          enabled = true
          transition = {
            days          = 30
            storage_class = "STANDARD_IA"
          }
        }
      ]
    }
  }

  tags = local.tags
}
```

### 6. API Gateway Module

**Location:** `infrastructure/terraform/modules/api-gateway/`

**Features:**
- REST API Gateway
- Lambda authorizer for JWT validation
- Request/response validation
- API keys and usage plans
- CloudWatch logging
- WAF integration

**Configuration:**

```hcl
module "api_gateway" {
  source = "../../modules/api-gateway"

  environment = "prod"
  api_name    = "kinga-api"

  # VPC Link to EKS
  vpc_link_enabled   = true
  nlb_arn            = module.eks.network_load_balancer_arn

  # Lambda authorizer
  authorizer_lambda_arn = module.lambda.jwt_authorizer_arn

  # API endpoints
  endpoints = {
    "/claims"       = { method = "ANY", integration_type = "VPC_LINK" }
    "/assessments"  = { method = "ANY", integration_type = "VPC_LINK" }
    "/quotes"       = { method = "ANY", integration_type = "VPC_LINK" }
    "/fraud"        = { method = "ANY", integration_type = "VPC_LINK" }
    "/notifications" = { method = "ANY", integration_type = "VPC_LINK" }
  }

  # Rate limiting
  throttle_settings = {
    burst_limit = 5000
    rate_limit  = 10000
  }

  # Logging
  access_log_enabled = true
  xray_tracing_enabled = true

  tags = local.tags
}
```

### 7. IAM Module

**Location:** `infrastructure/terraform/modules/iam/`

**Features:**
- Service-specific IAM roles
- Least privilege policies
- IRSA for Kubernetes pods
- Cross-account access roles
- MFA enforcement for admin access

**Key Roles:**

```hcl
module "iam" {
  source = "../../modules/iam"

  environment = "prod"

  # EKS Node Role
  eks_node_role_enabled = true

  # Service Account Roles (IRSA)
  service_account_roles = {
    claim-intake-service = {
      namespace = "kinga"
      policies  = ["s3:damage-photos:rw", "rds:claim-intake:rw"]
    }
    ai-damage-service = {
      namespace = "kinga"
      policies  = ["s3:damage-photos:ro", "rds:ai-damage:rw", "bedrock:invoke"]
    }
    fraud-detection-service = {
      namespace = "kinga"
      policies  = ["rds:fraud-detection:rw", "sagemaker:invoke"]
    }
    notification-service = {
      namespace = "kinga"
      policies  = ["ses:send-email", "sns:publish"]
    }
  }

  # Lambda Execution Roles
  lambda_roles = {
    jwt-authorizer = {
      policies = ["secretsmanager:GetSecretValue"]
    }
  }

  tags = local.tags
}
```

### 8. Monitoring Module

**Location:** `infrastructure/terraform/modules/monitoring/`

**Features:**
- CloudWatch Log Groups
- CloudWatch Metrics and Alarms
- CloudWatch Dashboards
- X-Ray tracing
- SNS topics for alerts

**Configuration:**

```hcl
module "monitoring" {
  source = "../../modules/monitoring"

  environment = "prod"

  # Log Groups
  log_groups = {
    eks-cluster        = { retention_days = 30 }
    api-gateway        = { retention_days = 30 }
    lambda-authorizer  = { retention_days = 7 }
    application-logs   = { retention_days = 90 }
  }

  # Alarms
  alarms = {
    eks-cpu-high = {
      metric_name         = "CPUUtilization"
      comparison_operator = "GreaterThanThreshold"
      threshold           = 80
      evaluation_periods  = 2
    }
    rds-cpu-high = {
      metric_name         = "CPUUtilization"
      comparison_operator = "GreaterThanThreshold"
      threshold           = 75
      evaluation_periods  = 3
    }
    api-5xx-errors = {
      metric_name         = "5XXError"
      comparison_operator = "GreaterThanThreshold"
      threshold           = 10
      evaluation_periods  = 1
    }
  }

  # SNS Topics for Alerts
  alert_email = "ops@kinga.com"

  tags = local.tags
}
```

---

## AWS CDK Implementation

### Alternative Implementation

For teams preferring AWS CDK (TypeScript), a complete implementation is provided:

**Location:** `infrastructure/cdk/`

```typescript
// infrastructure/cdk/lib/kinga-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as msk from '@aws-cdk/aws-msk-alpha';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class KingaStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'KingaVPC', {
      maxAzs: 3,
      natGateways: 3,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 20,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 20,
        },
        {
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 20,
        },
      ],
    });

    // EKS Cluster
    const cluster = new eks.Cluster(this, 'KingaEKS', {
      vpc,
      version: eks.KubernetesVersion.V1_28,
      defaultCapacity: 0,
    });

    // Node Groups
    cluster.addNodegroupCapacity('general', {
      instanceTypes: [new ec2.InstanceType('t3.large')],
      minSize: 3,
      maxSize: 10,
    });

    // RDS PostgreSQL (example for one database)
    const database = new rds.DatabaseInstance(this, 'ClaimIntakeDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.LARGE
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      multiAz: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      backupRetention: cdk.Duration.days(30),
    });

    // MSK Cluster
    const kafkaCluster = new msk.Cluster(this, 'KingaKafka', {
      clusterName: 'kinga-kafka',
      kafkaVersion: msk.KafkaVersion.V3_5_1,
      vpc,
      numberOfBrokerNodes: 3,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.M5,
        ec2.InstanceSize.LARGE
      ),
    });

    // S3 Buckets
    const dataLakeBucket = new s3.Bucket(this, 'DataLake', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });
  }
}
```

---

## Deployment Guide

### Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.0 installed
3. **kubectl** for Kubernetes management
4. **helm** for Kubernetes package management

### Step 1: Initialize Terraform

```bash
cd infrastructure/terraform/environments/prod
terraform init
```

### Step 2: Plan Deployment

```bash
terraform plan -out=tfplan
```

### Step 3: Apply Infrastructure

```bash
terraform apply tfplan
```

### Step 4: Configure kubectl

```bash
aws eks update-kubeconfig --name kinga-prod-eks --region us-east-1
```

### Step 5: Deploy Kubernetes Resources

```bash
# Install cluster autoscaler
helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  --set autoDiscovery.clusterName=kinga-prod-eks

# Install AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --set clusterName=kinga-prod-eks

# Deploy KINGA microservices
kubectl apply -f ../../deployment/
```

### Step 6: Verify Deployment

```bash
# Check EKS nodes
kubectl get nodes

# Check pods
kubectl get pods -n kinga

# Check services
kubectl get svc -n kinga
```

---

## Cost Optimization

### Estimated Monthly Costs (Production)

| Component | Configuration | Monthly Cost |
|-----------|--------------|--------------|
| EKS Cluster | 1 cluster | $73 |
| EKS Nodes | 3 t3.large on-demand | $150 |
| EKS Nodes | 2 c5.xlarge spot (avg) | $60 |
| RDS PostgreSQL | 11 × db.t4g.large Multi-AZ | $1,650 |
| RDS Read Replicas | 2 × db.t4g.large | $300 |
| MSK | 3 × kafka.m5.large | $450 |
| NAT Gateways | 3 × NAT GW | $100 |
| S3 Storage | 1 TB standard | $23 |
| Data Transfer | 500 GB/month | $45 |
| CloudWatch | Logs + Metrics | $50 |
| **Total** | | **~$2,900/month** |

### Cost Optimization Strategies

1. **Use Spot Instances** for compute-intensive workloads (60-90% savings)
2. **Reserved Instances** for RDS (up to 60% savings with 3-year commitment)
3. **S3 Lifecycle Policies** to move old data to Glacier (90% storage cost reduction)
4. **Single NAT Gateway** in dev/staging environments
5. **VPC Endpoints** for S3/ECR to reduce NAT data transfer costs
6. **Auto-scaling** to match capacity with demand
7. **Scheduled scaling** to reduce capacity during off-hours

---

## Security & Compliance

### Security Best Practices

1. **Network Isolation**
   - Private subnets for all application workloads
   - Database subnets with no internet access
   - Security groups with least privilege

2. **Encryption**
   - RDS encryption at rest with KMS
   - S3 encryption with SSE-S3 or KMS
   - MSK encryption in transit with TLS
   - EBS encryption for EKS node volumes

3. **IAM**
   - Service-specific IAM roles
   - IRSA for Kubernetes pods
   - MFA enforcement for admin access
   - Regular access key rotation

4. **Secrets Management**
   - AWS Secrets Manager for database credentials
   - External Secrets Operator for Kubernetes
   - No hardcoded secrets in code or IaC

5. **Monitoring & Auditing**
   - VPC Flow Logs
   - CloudTrail for API auditing
   - GuardDuty for threat detection
   - Security Hub for compliance

### Compliance

- **GDPR**: Data encryption, access controls, audit logs
- **PCI DSS**: Network segmentation, encryption, monitoring
- **SOC 2**: Security controls, availability, confidentiality

---

## Monitoring & Observability

### CloudWatch Dashboards

**EKS Cluster Dashboard:**
- Node CPU/Memory utilization
- Pod count and status
- Network throughput
- Disk I/O

**RDS Dashboard:**
- CPU/Memory utilization
- Database connections
- Read/Write IOPS
- Replication lag

**MSK Dashboard:**
- Broker CPU/Memory
- Disk usage
- Message throughput
- Consumer lag

**Application Dashboard:**
- Request rate (RPM)
- Error rate (5xx, 4xx)
- Response time (p50, p95, p99)
- Active connections

### Alarms

**Critical Alarms:**
- EKS node CPU > 80%
- RDS CPU > 75%
- RDS storage < 20% free
- MSK disk usage > 80%
- API Gateway 5xx error rate > 1%

**Warning Alarms:**
- EKS node CPU > 60%
- RDS CPU > 60%
- MSK consumer lag > 1000
- S3 bucket size > threshold

### X-Ray Tracing

Distributed tracing enabled for:
- API Gateway requests
- Lambda authorizers
- EKS microservices
- RDS queries

---

## Appendices

### Appendix A: Complete Terraform Code

See `infrastructure/terraform/` directory for complete Terraform modules and environment configurations.

### Appendix B: AWS CDK Code

See `infrastructure/cdk/` directory for complete AWS CDK implementation.

### Appendix C: Kubernetes Manifests

See `deployment/` directory for Kubernetes deployment manifests.

### Appendix D: Runbooks

See `docs/runbooks/` directory for operational runbooks.

---

**Document Version:** 1.0.0  
**Last Updated:** February 11, 2026  
**Author:** Tavonga Shoko
