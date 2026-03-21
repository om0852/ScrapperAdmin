#!/bin/bash

# Docker Helper Script for Quick Commerce Scrapers
# Makes it easier to manage Docker containers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_header() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

function print_error() {
    echo -e "${RED}❌ Error: $1${NC}"
}

function print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

function print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Main menu
function show_menu() {
    print_header "Quick Commerce Docker Manager"
    echo "1) Start all services"
    echo "2) Stop all services"
    echo "3) View logs"
    echo "4) Check status"
    echo "5) Rebuild images"
    echo "6) Clean everything (remove volumes)"
    echo "7) Run development mode"
    echo "8) Access MongoDB shell"
    echo "9) View resource usage"
    echo "0) Exit"
    echo ""
    read -p "Select option: " choice
}

function start_services() {
    print_header "Starting Services"
    docker-compose up -d
    print_success "Services started!"
    sleep 3
    docker-compose ps
}

function stop_services() {
    print_header "Stopping Services"
    docker-compose down
    print_success "Services stopped!"
}

function view_logs() {
    echo ""
    echo "1) Mainserver logs"
    echo "2) MongoDB logs"
    echo "3) All services logs"
    echo "4) Blinkit logs"
    echo "5) DMart logs"
    echo "0) Back to menu"
    read -p "Select: " log_choice
    
    case $log_choice in
        1) docker-compose logs -f mainserver ;;
        2) docker-compose logs -f mongodb ;;
        3) docker-compose logs -f ;;
        4) docker-compose logs -f mainserver | grep -i blinkit || print_info "No Blinkit-specific logs found" ;;
        5) docker-compose logs -f mainserver | grep -i dmart || print_info "No DMart-specific logs found" ;;
        0) show_menu ;;
        *) print_error "Invalid option" ;;
    esac
}

function check_status() {
    print_header "Service Status"
    docker-compose ps
    echo ""
    print_info "MongoDB Health:"
    docker-compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" 2>/dev/null || print_error "MongoDB not responding"
}

function rebuild_images() {
    print_header "Rebuilding Images"
    docker-compose down
    docker-compose build --no-cache
    print_success "Images rebuilt!"
}

function clean_everything() {
    print_header "⚠️  Full Cleanup"
    read -p "This will remove all containers, volumes, and data. Continue? (y/N): " confirm
    if [[ $confirm == "y" ]]; then
        docker-compose down -v
        docker system prune -f
        print_success "Everything cleaned!"
    else
        print_info "Cleanup cancelled"
    fi
}

function start_dev() {
    print_header "Starting Development Mode"
    docker-compose --profile dev up mainserver-dev
}

function access_mongodb() {
    print_header "Accessing MongoDB"
    print_info "Connecting to MongoDB shell..."
    docker-compose exec mongodb mongosh -u root -p password123 --authenticationDatabase admin quickcommerce
}

function resource_usage() {
    print_header "Resource Usage"
    docker stats
}

# Main loop
while true; do
    show_menu
    
    case $choice in
        1) start_services ;;
        2) stop_services ;;
        3) view_logs ;;
        4) check_status ;;
        5) rebuild_images ;;
        6) clean_everything ;;
        7) start_dev ;;
        8) access_mongodb ;;
        9) resource_usage ;;
        0) print_info "Goodbye!"; exit 0 ;;
        *) print_error "Invalid option. Please try again." ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
done
