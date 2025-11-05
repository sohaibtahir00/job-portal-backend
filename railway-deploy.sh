#!/bin/bash

# ================================================
# Railway Deployment Helper Script
# ================================================
# This script helps prepare and deploy your app to Railway
#
# Usage:
#   ./railway-deploy.sh [command]
#
# Commands:
#   check     - Check deployment readiness
#   secrets   - Generate secrets for environment variables
#   migrate   - Run database migrations on Railway
#   test      - Test production endpoints
#   logs      - View Railway logs
#   help      - Show this help message
# ================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Check if Railway CLI is installed
check_railway_cli() {
    if ! command -v railway &> /dev/null; then
        print_error "Railway CLI not found"
        print_info "Install with: npm install -g @railway/cli"
        return 1
    fi
    print_success "Railway CLI installed"
    return 0
}

# Check deployment readiness
check_readiness() {
    print_header "Checking Deployment Readiness"

    local errors=0

    # Check Node.js version
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            print_success "Node.js version: $(node -v)"
        else
            print_error "Node.js version too old. Requires 18+"
            ((errors++))
        fi
    else
        print_error "Node.js not found"
        ((errors++))
    fi

    # Check if package.json exists
    if [ -f "package.json" ]; then
        print_success "package.json found"
    else
        print_error "package.json not found"
        ((errors++))
    fi

    # Check if railway.json exists
    if [ -f "railway.json" ]; then
        print_success "railway.json found"
    else
        print_warning "railway.json not found (optional but recommended)"
    fi

    # Check if .env.example exists
    if [ -f ".env.example" ]; then
        print_success ".env.example found"
    else
        print_warning ".env.example not found"
    fi

    # Check if prisma schema exists
    if [ -f "prisma/schema.prisma" ]; then
        print_success "Prisma schema found"
    else
        print_error "Prisma schema not found"
        ((errors++))
    fi

    # Check if .git directory exists
    if [ -d ".git" ]; then
        print_success "Git repository initialized"
    else
        print_error "Git repository not found"
        print_info "Initialize with: git init"
        ((errors++))
    fi

    # Check if node_modules exists
    if [ -d "node_modules" ]; then
        print_success "Dependencies installed"
    else
        print_warning "Dependencies not installed"
        print_info "Run: npm install"
    fi

    # Check for uncommitted changes
    if [ -d ".git" ]; then
        if git diff-index --quiet HEAD --; then
            print_success "No uncommitted changes"
        else
            print_warning "You have uncommitted changes"
            print_info "Commit with: git add . && git commit -m 'message'"
        fi
    fi

    # Summary
    echo ""
    if [ $errors -eq 0 ]; then
        print_success "All checks passed! Ready to deploy to Railway"
        return 0
    else
        print_error "$errors error(s) found. Fix them before deploying."
        return 1
    fi
}

# Generate secrets
generate_secrets() {
    print_header "Generating Secrets for Environment Variables"

    echo "Copy these values to your Railway environment variables:"
    echo ""

    # Generate NEXTAUTH_SECRET
    print_info "NEXTAUTH_SECRET:"
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    echo "$NEXTAUTH_SECRET"
    echo ""

    # Generate CRON_SECRET
    print_info "CRON_SECRET:"
    CRON_SECRET=$(openssl rand -hex 32)
    echo "$CRON_SECRET"
    echo ""

    print_success "Secrets generated!"
    print_info "Add these to Railway dashboard > Variables"
}

# Run migrations on Railway
run_migrations() {
    print_header "Running Database Migrations on Railway"

    if ! check_railway_cli; then
        return 1
    fi

    print_info "Running migrations..."
    railway run npx prisma migrate deploy

    if [ $? -eq 0 ]; then
        print_success "Migrations completed successfully"
    else
        print_error "Migration failed"
        return 1
    fi
}

# Test production endpoints
test_production() {
    print_header "Testing Production Endpoints"

    # Get Railway URL
    print_info "Enter your Railway app URL (e.g., https://your-app.up.railway.app):"
    read -r APP_URL

    if [ -z "$APP_URL" ]; then
        print_error "URL is required"
        return 1
    fi

    # Test health endpoint
    print_info "Testing health endpoint..."
    HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$APP_URL/api/health")
    HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        print_success "Health check passed (HTTP $HTTP_CODE)"
        echo "$HEALTH_RESPONSE" | head -n-1 | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE" | head -n-1
    else
        print_error "Health check failed (HTTP $HTTP_CODE)"
        return 1
    fi

    # Test jobs endpoint
    echo ""
    print_info "Testing jobs endpoint..."
    JOBS_RESPONSE=$(curl -s -w "\n%{http_code}" "$APP_URL/api/jobs?limit=1")
    HTTP_CODE=$(echo "$JOBS_RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        print_success "Jobs endpoint working (HTTP $HTTP_CODE)"
    else
        print_warning "Jobs endpoint returned HTTP $HTTP_CODE"
    fi

    echo ""
    print_success "Production testing completed"
}

# View Railway logs
view_logs() {
    print_header "Viewing Railway Logs"

    if ! check_railway_cli; then
        return 1
    fi

    railway logs
}

# Show help
show_help() {
    cat << EOF
Railway Deployment Helper Script

Usage:
  ./railway-deploy.sh [command]

Commands:
  check       Check if your app is ready for deployment
  secrets     Generate secrets for environment variables
  migrate     Run database migrations on Railway
  test        Test production endpoints
  logs        View Railway application logs
  help        Show this help message

Examples:
  ./railway-deploy.sh check          # Check readiness
  ./railway-deploy.sh secrets        # Generate secrets
  ./railway-deploy.sh migrate        # Run migrations
  ./railway-deploy.sh test           # Test production

Documentation:
  See DEPLOYMENT.md for complete guide
EOF
}

# Main script logic
main() {
    case "${1:-help}" in
        check)
            check_readiness
            ;;
        secrets)
            generate_secrets
            ;;
        migrate)
            run_migrations
            ;;
        test)
            test_production
            ;;
        logs)
            view_logs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
