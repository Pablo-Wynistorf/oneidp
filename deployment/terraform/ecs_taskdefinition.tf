variable "environment_variables" {
  type        = map(string)
  description = "Environment variables for the ECS task definition"
}


data "aws_caller_identity" "current" {}


resource "aws_ecs_task_definition" "oneidp" {
  family                   = "oneidp-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "3072"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  runtime_platform {
    cpu_architecture      = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "oneidp"
      image     = "pablo06/oneidp:latest"
      cpu       = 0
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
      environment = [
        for k, v in var.environment_variables : {
          name  = k
          value = v
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


resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_logs" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}