#!/bin/bash

echo "======================================"
echo "Educational Platform - Quick Start"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo "Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js found: $(node --version)${NC}"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed. Please install PostgreSQL 14+ first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL found${NC}"

echo ""
echo "======================================"
echo "Step 1: Database Setup"
echo "======================================"
echo ""
echo "Please enter your PostgreSQL credentials:"
read -p "PostgreSQL username (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "PostgreSQL password: " DB_PASSWORD
echo ""

# Create database
echo ""
echo "Creating database..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -c "CREATE DATABASE edu_platform;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database created${NC}"
else
    echo -e "${YELLOW}⚠️  Database might already exist, continuing...${NC}"
fi

# Run schema
echo "Running database schema..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d edu_platform -f database/schema.sql
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Schema loaded${NC}"
else
    echo -e "${RED}❌ Failed to load schema${NC}"
    exit 1
fi

echo ""
echo "======================================"
echo "Step 2: Backend Setup"
echo "======================================"
echo ""

cd server

# Create .env file
if [ ! -f .env ]; then
    echo "Creating backend .env file..."
    cat > .env << ENVFILE
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=edu_platform
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRE=7d

CLIENT_URL=http://localhost:5173
ENVFILE
    echo -e "${GREEN}✅ .env file created${NC}"
fi

# Install dependencies
echo "Installing backend dependencies..."
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install backend dependencies${NC}"
    exit 1
fi

cd ..

echo ""
echo "======================================"
echo "Step 3: Frontend Setup"
echo "======================================"
echo ""

cd client

# Create .env file
if [ ! -f .env ]; then
    echo "Creating frontend .env file..."
    cat > .env << ENVFILE
VITE_API_URL=http://localhost:5000/api
ENVFILE
    echo -e "${GREEN}✅ .env file created${NC}"
fi

# Install dependencies
echo "Installing frontend dependencies..."
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install frontend dependencies${NC}"
    exit 1
fi

cd ..

echo ""
echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
echo ""
echo "To start the application:"
echo ""
echo "1. Start the backend (in one terminal):"
echo "   cd server && npm run dev"
echo ""
echo "2. Start the frontend (in another terminal):"
echo "   cd client && npm run dev"
echo ""
echo "3. Open your browser:"
echo "   http://localhost:5173"
echo ""
echo "Default admin login (after first user registration):"
echo "   Email: admin@eduplatform.com"
echo "   Password: Admin@123"
echo ""
echo "For customization, see CUSTOMIZATION_GUIDE.md"
echo ""
echo "Happy coding! 🚀"
echo ""

