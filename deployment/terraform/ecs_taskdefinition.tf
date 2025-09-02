# Create ECS Task Definition
resource "aws_ecs_task_definition" "oneidp" {
  family                   = "oneidp-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "3072"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  runtime_platform {
    cpu_architecture       = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "oneidp"
      image     = "pablo06/oneidp:latest"
      cpu       = 1024
      memory    = 3072
      essential = true
      portMappings = [
        {
          name          = "http"
          containerPort = 80
          hostPort      = 80
          protocol      = "tcp"
          appProtocol   = "http"
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.api_port}/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 2
        startPeriod = 60
      }
      environment = [
        for var in local.env_vars : {
          name  = var.name
          value = var.value
        }
      ]
      readonlyRootFilesystem = true
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/oneidp-cluster/oneidp"
          "mode"                  = "non-blocking"
          "awslogs-create-group"  = "true"
          "max-buffer-size"       = "25m"
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}


# ENV Variables
locals {
  env_vars = [
    {
      name  = "API_PORT"
      value = var.api_port
    },
    {
      name  = "DC_MONITORING_WEBHOOK_URL"
      value = var.dc_monitoring_webhook_url
    },
    {
      name  = "GITHUB_CLIENT_ID"
      value = var.github_client_id
    },
    {
      name  = "GITHUB_CLIENT_SECRET"
      value = var.github_client_secret
    },
    {
      name  = "GOOGLE_CLIENT_ID"
      value = var.google_client_id
    },
    {
      name  = "GOOGLE_CLIENT_SECRET"
      value = var.google_client_secret
    },
    {
      name  = "JWT_PRIVATE_KEY"
      value = var.jwt_private_key
    },
    {
      name  = "JWT_PUBLIC_KEY"
      value = var.jwt_public_key
    },
    {
      name  = "MJ_APIKEY_PRIVATE"
      value = var.mj_api_key_private
    },
    {
      name  = "MJ_APIKEY_PUBLIC"
      value = var.mj_api_key_public
    },
    {
      name  = "MJ_SENDER_EMAIL"
      value = var.mj_sender_email
    },
    {
      name  = "POSTGRES_URI"
      value = var.postgres_uri
    },
    {
      name  = "REDIS_URI"
      value = var.redis_uri
    },
    {
      name  = "URL"
      value = var.url
    },
    {
      name  = "DOMAIN"
      value = var.domain
    },
    {
      name  = "GOOGLE_ANALYTICS_TAG_ID"
      value = var.google_analytics_tag_id
    }

  ]
}

# Create IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "oneidpTaskExecutionRole"

  assume_role_policy = jsonencode({
    Version : "2012-10-17"
    Statement : [
      {
        Effect : "Allow"
        Principal : {
          Service : "ecs-tasks.amazonaws.com"
        }
        Action : "sts:AssumeRole"
      }
    ]
  })
}

# Attach Policies to the ECS Execution Role
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Attach Policies to the ECS Execution Role
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_logs" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}