# Create a VPC
resource "aws_vpc" "oneidp_vpc" {
  cidr_block = "10.1.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support = true
  tags = {
    Name = "oneidp-vpc"
  }
}

# Create an Internet Gateway
resource "aws_internet_gateway" "internet_gateway" {
  vpc_id = aws_vpc.oneidp_vpc.id
}

# Create a NAT-Gateway EIP
resource "aws_eip" "oneidp_nat_gateway_eip" {
}

# Create a public subnet-a
resource "aws_subnet" "oneidp_a_1" {
  vpc_id     = aws_vpc.oneidp_vpc.id
  cidr_block = "10.1.1.0/24"
  availability_zone = "${var.region}a"
  map_public_ip_on_launch = true
    tags = {
    Name = "oneidp-public-a-1"
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/role/elb" = "1"
  }
}

# Create a public subnet-b
resource "aws_subnet" "oneidp_b_1" {
  vpc_id     = aws_vpc.oneidp_vpc.id
  cidr_block = "10.1.2.0/24"
  availability_zone = "${var.region}b"
  map_public_ip_on_launch = true
    tags = {
    Name = "oneidp-public-b-1"
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/role/elb" = "1"
  }
}

# Create a public subnet-c
resource "aws_subnet" "oneidp_c_1" {
  vpc_id     = aws_vpc.oneidp_vpc.id
  cidr_block = "10.1.3.0/24"
  availability_zone = "${var.region}c"
  map_public_ip_on_launch = true
    tags = {
    Name = "oneidp-public-c-1"
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/role/elb" = "1"
  }
}

# Create a private subnet-a
resource "aws_subnet" "oneidp_a_2" {
  vpc_id     = aws_vpc.oneidp_vpc.id
  cidr_block = "10.1.10.0/24"
  availability_zone = "${var.region}a"
    tags = {
    Name = "oneidp-workload-a-1"
  }
}

# Create a private subnet-b
resource "aws_subnet" "oneidp_b_2" {
  vpc_id     = aws_vpc.oneidp_vpc.id
  cidr_block = "10.1.20.0/24"
  availability_zone = "${var.region}b"
    tags = {
    Name = "oneidp-workload-b-1"
  }
}

# Create a private subnet-c
resource "aws_subnet" "oneidp_c_2" {
  vpc_id     = aws_vpc.oneidp_vpc.id
  cidr_block = "10.1.30.0/24"
  availability_zone = "${var.region}c"
    tags = {
    Name = "oneidp-workload-c-1"
  }
}

# Create a NAT-Gateway
resource "aws_nat_gateway" "oneidp_nat_gateway" {
  allocation_id = aws_eip.oneidp_nat_gateway_eip.id
  subnet_id     = aws_subnet.oneidp_a_1.id
}

# Create a route table to internet gatway
resource "aws_route_table" "main_route_table" {
  vpc_id = aws_vpc.oneidp_vpc.id
  tags = {
    "Name" = "oneidp-public-rt"
  }
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${aws_internet_gateway.internet_gateway.id}"
  }
}

# Create a route table to NAT-Gateway
resource "aws_route_table" "workload_route_table" {
  vpc_id = aws_vpc.oneidp_vpc.id
  tags = {
    "Name" = "oneidp-workload-rt"
  }
    route {
        cidr_block = "0.0.0.0/0"
        nat_gateway_id = "${aws_nat_gateway.oneidp_nat_gateway.id}"
    }
}

# Set the main route table in the VPC
resource "aws_main_route_table_association" "main_route_table_association" {
  vpc_id = aws_vpc.oneidp_vpc.id
  route_table_id = aws_route_table.main_route_table.id
}

# Create route table assosiation
resource "aws_route_table_association" "public_a_1_route_table_association" {
  subnet_id = "${aws_subnet.oneidp_a_1.id}"
  route_table_id = "${aws_route_table.main_route_table.id}"
}

# Create route table assosiation
resource "aws_route_table_association" "public_b_1_route_table_association" {
  subnet_id = "${aws_subnet.oneidp_b_1.id}"
  route_table_id = "${aws_route_table.main_route_table.id}"
}

# Create route table assosiation
resource "aws_route_table_association" "public_c_1_route_table_association" {
  subnet_id = "${aws_subnet.oneidp_c_1.id}"
  route_table_id = "${aws_route_table.main_route_table.id}"
}

# Create route table assosiation
resource "aws_route_table_association" "workload_a_1_route_table_association" {
  subnet_id = "${aws_subnet.oneidp_a_2.id}"
  route_table_id = "${aws_route_table.workload_route_table.id}"
}

# Create route table assosiation
resource "aws_route_table_association" "workload_b_1_route_table_association" {
  subnet_id = "${aws_subnet.oneidp_b_2.id}"
  route_table_id = "${aws_route_table.workload_route_table.id}"
}

# Create route table assosiation
resource "aws_route_table_association" "workload_c_1_route_table_association" {
  subnet_id = "${aws_subnet.oneidp_c_2.id}"
  route_table_id = "${aws_route_table.workload_route_table.id}"
}

#Create a security group
resource "aws_security_group" "loadbalancer" {
  name        = "LOADBALANCER-HTTP-HTTPS"
  description = "Application Loadbalancer Port 80 and 443 open"
  vpc_id      = aws_vpc.oneidp_vpc.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    ipv6_cidr_blocks = ["::/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "udp"
    ipv6_cidr_blocks = ["::/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    ipv6_cidr_blocks = ["::/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "udp"
    ipv6_cidr_blocks = ["::/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
    tags = {
    Name = "LOADBALANCER-HTTP-HTTPS"
  }
}

#Create a security group
resource "aws_security_group" "http_by_loadbalancer" {
  name        = "HTTP-BY-LOADBALANCER"
  description = "Allows connections from the Securitygroup of the Loadbalancer"
  vpc_id      = aws_vpc.oneidp_vpc.id
  ingress {
    from_port = 80
    to_port = 80
    protocol = "tcp"
    security_groups = ["${aws_security_group.loadbalancer.id}"]
  }
  ingress {
    from_port = 80
    to_port = 80
    protocol = "udp"
    security_groups = ["${aws_security_group.loadbalancer.id}"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
    tags = {
    Name = "HTTP-BY-LOADBALANCER"
  }
}