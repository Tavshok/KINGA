# MLflow Tracking Server on ECS Fargate

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# RDS PostgreSQL for MLflow backend
resource "aws_db_instance" "mlflow" {
  identifier = "kinga-mlflow-db"
  
  engine         = "postgres"
  engine_version = "15.5"
  instance_class = "db.t3.medium"
  
  allocated_storage     = 100
  max_allocated_storage = 500
  storage_type          = "gp3"
  storage_encrypted     = true
  
  db_name  = "mlflow"
  username = var.db_username
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.mlflow_db.id]
  db_subnet_group_name   = aws_db_subnet_group.mlflow.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"
  
  skip_final_snapshot       = false
  final_snapshot_identifier = "kinga-mlflow-db-final-snapshot"
  
  tags = {
    Name        = "kinga-mlflow-db"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_db_subnet_group" "mlflow" {
  name       = "kinga-mlflow-db-subnet-group"
  subnet_ids = var.private_subnet_ids
  
  tags = {
    Name = "kinga-mlflow-db-subnet-group"
  }
}

resource "aws_security_group" "mlflow_db" {
  name        = "kinga-mlflow-db-sg"
  description = "Security group for MLflow RDS database"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.mlflow_ecs.id]
    description     = "PostgreSQL from MLflow ECS tasks"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "kinga-mlflow-db-sg"
  }
}

# S3 bucket for MLflow artifacts
resource "aws_s3_bucket" "mlflow_artifacts" {
  bucket = "kinga-mlflow-artifacts-${var.environment}"
  
  tags = {
    Name        = "kinga-mlflow-artifacts"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "mlflow_artifacts" {
  bucket = aws_s3_bucket.mlflow_artifacts.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "mlflow_artifacts" {
  bucket = aws_s3_bucket.mlflow_artifacts.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "mlflow_artifacts" {
  bucket = aws_s3_bucket.mlflow_artifacts.id
  
  rule {
    id     = "transition-to-ia"
    status = "Enabled"
    
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 180
      storage_class = "GLACIER"
    }
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "mlflow" {
  name = "kinga-mlflow-cluster"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  
  tags = {
    Name        = "kinga-mlflow-cluster"
    Environment = var.environment
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "mlflow" {
  family                   = "kinga-mlflow-tracking-server"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.mlflow_task.arn
  
  container_definitions = jsonencode([
    {
      name      = "mlflow-server"
      image     = "${var.ecr_repository_url}:latest"
      essential = true
      
      portMappings = [
        {
          containerPort = 5000
          protocol      = "tcp"
        }
      ]
      
      environment = [
        {
          name  = "MLFLOW_BACKEND_STORE_URI"
          value = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.mlflow.endpoint}/mlflow"
        },
        {
          name  = "MLFLOW_DEFAULT_ARTIFACT_ROOT"
          value = "s3://${aws_s3_bucket.mlflow_artifacts.id}/"
        },
        {
          name  = "MLFLOW_S3_ENDPOINT_URL"
          value = "https://s3.${var.aws_region}.amazonaws.com"
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.mlflow.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "mlflow"
        }
      }
      
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:5000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
  
  tags = {
    Name        = "kinga-mlflow-task"
    Environment = var.environment
  }
}

# ECS Service
resource "aws_ecs_service" "mlflow" {
  name            = "kinga-mlflow-service"
  cluster         = aws_ecs_cluster.mlflow.id
  task_definition = aws_ecs_task_definition.mlflow.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.mlflow_ecs.id]
    assign_public_ip = false
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.mlflow.arn
    container_name   = "mlflow-server"
    container_port   = 5000
  }
  
  depends_on = [aws_lb_listener.mlflow]
  
  tags = {
    Name        = "kinga-mlflow-service"
    Environment = var.environment
  }
}

resource "aws_security_group" "mlflow_ecs" {
  name        = "kinga-mlflow-ecs-sg"
  description = "Security group for MLflow ECS tasks"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.mlflow_alb.id]
    description     = "MLflow from ALB"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "kinga-mlflow-ecs-sg"
  }
}

# Application Load Balancer
resource "aws_lb" "mlflow" {
  name               = "kinga-mlflow-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.mlflow_alb.id]
  subnets            = var.private_subnet_ids
  
  enable_deletion_protection = true
  
  tags = {
    Name        = "kinga-mlflow-alb"
    Environment = var.environment
  }
}

resource "aws_security_group" "mlflow_alb" {
  name        = "kinga-mlflow-alb-sg"
  description = "Security group for MLflow ALB"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "HTTP from VPC"
  }
  
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "HTTPS from VPC"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "kinga-mlflow-alb-sg"
  }
}

resource "aws_lb_target_group" "mlflow" {
  name        = "kinga-mlflow-tg"
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }
  
  tags = {
    Name = "kinga-mlflow-tg"
  }
}

resource "aws_lb_listener" "mlflow" {
  load_balancer_arn = aws_lb.mlflow.arn
  port              = "80"
  protocol          = "HTTP"
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mlflow.arn
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "mlflow" {
  name              = "/ecs/kinga-mlflow"
  retention_in_days = 30
  
  tags = {
    Name        = "kinga-mlflow-logs"
    Environment = var.environment
  }
}

# IAM Roles
resource "aws_iam_role" "ecs_execution" {
  name = "kinga-mlflow-ecs-execution-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "mlflow_task" {
  name = "kinga-mlflow-task-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "mlflow_s3" {
  name = "kinga-mlflow-s3-policy"
  role = aws_iam_role.mlflow_task.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.mlflow_artifacts.arn,
          "${aws_s3_bucket.mlflow_artifacts.arn}/*"
        ]
      }
    ]
  })
}

# Outputs
output "mlflow_endpoint" {
  description = "MLflow tracking server endpoint"
  value       = "http://${aws_lb.mlflow.dns_name}"
}

output "mlflow_db_endpoint" {
  description = "MLflow RDS database endpoint"
  value       = aws_db_instance.mlflow.endpoint
}

output "mlflow_artifacts_bucket" {
  description = "S3 bucket for MLflow artifacts"
  value       = aws_s3_bucket.mlflow_artifacts.id
}
