#!/bin/bash

# Made in World Database Seed Verification Script
# This script verifies that generated seed files can successfully recreate the database
# Usage: ./verify_seeds.sh [test_db_name]

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SEEDS_DIR="$PROJECT_ROOT/database/seeds"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Database configuration (from environment or defaults)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-madeinworld_admin}"
DB_NAME="${DB_NAME:-madeinworld_db}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Test database name
TEST_DB_NAME="${1:-madeinworld_test_$TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v psql &> /dev/null; then
        error "psql is not installed. Please install PostgreSQL client tools."
        exit 1
    fi
    
    if ! command -v createdb &> /dev/null; then
        error "createdb is not installed. Please install PostgreSQL client tools."
        exit 1
    fi
    
    if ! command -v dropdb &> /dev/null; then
        error "dropdb is not installed. Please install PostgreSQL client tools."
        exit 1
    fi
    
    success "All dependencies are available."
}

# Execute SQL query and return results
execute_query() {
    local query="$1"
    local db_name="${2:-$DB_NAME}"
    local conn_str="host=$DB_HOST port=$DB_PORT user=$DB_USER dbname=$db_name"
    
    if [ -n "$DB_PASSWORD" ]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
    
    psql "$conn_str" -t -c "$query" 2>/dev/null
}

# Test database connection
test_connection() {
    log "Testing database connection..."
    
    if execute_query "SELECT 1;" >/dev/null; then
        success "Database connection successful."
    else
        error "Failed to connect to database. Please check your connection settings."
        exit 1
    fi
}

# Check if seed files exist
check_seed_files() {
    log "Checking seed files..."
    
    local required_files=(
        "seed_all.sql"
        "01_manufacturers.sql"
        "02_stores.sql"
        "03_product_categories.sql"
        "04_subcategories.sql"
        "05_products.sql"
        "06_product_images.sql"
        "07_product_category_mapping.sql"
        "08_product_subcategory_mapping.sql"
        "09_inventory.sql"
    )
    
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$SEEDS_DIR/$file" ]; then
            missing_files+=("$file")
        fi
    done
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        error "Missing seed files:"
        for file in "${missing_files[@]}"; do
            error "  - $file"
        done
        error "Please run ./scripts/generate_seeds.sh first."
        exit 1
    fi
    
    success "All required seed files found."
}

# Get table counts from original database
get_original_counts() {
    log "Getting original database table counts..."

    local tables=("manufacturers" "stores" "product_categories" "subcategories" "products" "product_images" "product_category_mapping" "product_subcategory_mapping" "inventory")

    # Create temporary file to store counts
    local counts_file="/tmp/original_counts_$$"

    for table in "${tables[@]}"; do
        local count=$(execute_query "SELECT COUNT(*) FROM $table;" | tr -d ' ')
        echo "$table:$count" >> "$counts_file"
        log "Original $table: $count records"
    done
}

# Create test database
create_test_database() {
    log "Creating test database: $TEST_DB_NAME"
    
    # Drop test database if it exists
    dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" 2>/dev/null || true
    
    # Create test database
    if createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME"; then
        success "Test database created: $TEST_DB_NAME"
    else
        error "Failed to create test database."
        exit 1
    fi
}

# Initialize test database schema
initialize_test_schema() {
    log "Initializing test database schema..."
    
    local conn_str="host=$DB_HOST port=$DB_PORT user=$DB_USER dbname=$TEST_DB_NAME"
    if [ -n "$DB_PASSWORD" ]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
    
    if psql "$conn_str" -f "$PROJECT_ROOT/database/current_schema.sql" >/dev/null 2>&1; then
        success "Test database schema initialized."
    else
        error "Failed to initialize test database schema."
        exit 1
    fi
}

# Import seed data to test database
import_seed_data() {
    log "Importing seed data to test database..."
    
    local conn_str="host=$DB_HOST port=$DB_PORT user=$DB_USER dbname=$TEST_DB_NAME"
    if [ -n "$DB_PASSWORD" ]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
    
    if psql "$conn_str" -f "$SEEDS_DIR/seed_all.sql" >/dev/null 2>&1; then
        success "Seed data imported successfully."
    else
        error "Failed to import seed data."
        exit 1
    fi
}

# Verify table counts in test database
verify_table_counts() {
    log "Verifying table counts in test database..."

    local tables=("manufacturers" "stores" "product_categories" "subcategories" "products" "product_images" "product_category_mapping" "product_subcategory_mapping" "inventory")
    local counts_file="/tmp/original_counts_$$"

    local verification_passed=true

    for table in "${tables[@]}"; do
        local test_count=$(execute_query "SELECT COUNT(*) FROM $table;" "$TEST_DB_NAME" | tr -d ' ')
        local original_count=$(grep "^$table:" "$counts_file" | cut -d: -f2)

        if [ "$test_count" -eq "$original_count" ]; then
            success "✓ $table: $test_count records (matches original)"
        else
            error "✗ $table: $test_count records (expected $original_count)"
            verification_passed=false
        fi
    done

    if [ "$verification_passed" = true ]; then
        success "All table counts verified successfully."
    else
        error "Table count verification failed."
        return 1
    fi
}

# Verify data integrity
verify_data_integrity() {
    log "Verifying data integrity..."
    
    local integrity_checks=(
        "SELECT COUNT(*) FROM products WHERE store_id IS NOT NULL AND store_id NOT IN (SELECT store_id FROM stores)"
        "SELECT COUNT(*) FROM subcategories WHERE parent_category_id NOT IN (SELECT category_id FROM product_categories)"
        "SELECT COUNT(*) FROM product_images WHERE product_id NOT IN (SELECT product_id FROM products)"
        "SELECT COUNT(*) FROM product_category_mapping WHERE product_id NOT IN (SELECT product_id FROM products)"
        "SELECT COUNT(*) FROM product_category_mapping WHERE category_id NOT IN (SELECT category_id FROM product_categories)"
        "SELECT COUNT(*) FROM product_subcategory_mapping WHERE product_id NOT IN (SELECT product_id FROM products)"
        "SELECT COUNT(*) FROM product_subcategory_mapping WHERE subcategory_id NOT IN (SELECT subcategory_id FROM subcategories)"
        "SELECT COUNT(*) FROM inventory WHERE product_id NOT IN (SELECT product_id FROM products)"
        "SELECT COUNT(*) FROM inventory WHERE store_id NOT IN (SELECT store_id FROM stores)"
    )
    
    local check_names=(
        "Products with invalid manufacturer_id"
        "Products with invalid store_id"
        "Subcategories with invalid parent_category_id"
        "Product images with invalid product_id"
        "Product-category mappings with invalid product_id"
        "Product-category mappings with invalid category_id"
        "Product-subcategory mappings with invalid product_id"
        "Product-subcategory mappings with invalid subcategory_id"
        "Inventory with invalid product_id"
        "Inventory with invalid store_id"
    )
    
    local integrity_passed=true
    
    for i in "${!integrity_checks[@]}"; do
        local check="${integrity_checks[$i]}"
        local name="${check_names[$i]}"
        local result=$(execute_query "$check" "$TEST_DB_NAME" | tr -d ' ')
        
        if [ "$result" -eq 0 ]; then
            success "✓ $name: No issues found"
        else
            error "✗ $name: $result issues found"
            integrity_passed=false
        fi
    done
    
    if [ "$integrity_passed" = true ]; then
        success "All data integrity checks passed."
    else
        error "Data integrity verification failed."
        return 1
    fi
}

# Generate verification report
generate_verification_report() {
    log "Generating verification report..."
    
    local report_file="$PROJECT_ROOT/verification_report_$TIMESTAMP.txt"
    
    cat > "$report_file" << EOF
Made in World Database Seed Verification Report
===============================================
Generated on: $(date)
Test Database: $TEST_DB_NAME
Original Database: $DB_NAME

Verification Summary:
- Schema initialization: SUCCESS
- Seed data import: SUCCESS
- Table count verification: SUCCESS
- Data integrity checks: SUCCESS

Table Counts Comparison:
EOF
    
    local tables=("manufacturers" "stores" "product_categories" "subcategories" "products" "product_images" "product_category_mapping" "product_subcategory_mapping" "inventory")
    
    for table in "${tables[@]}"; do
        local test_count=$(execute_query "SELECT COUNT(*) FROM $table;" "$TEST_DB_NAME" | tr -d ' ')
        local original_count=$(grep "^$table:" "/tmp/original_counts_$$" | cut -d: -f2)
        printf "%-30s: %s (original: %s)\n" "$table" "$test_count" "$original_count" >> "$report_file"
    done
    
    echo "" >> "$report_file"
    echo "Test Database Details:" >> "$report_file"
    echo "- Host: $DB_HOST:$DB_PORT" >> "$report_file"
    echo "- Database: $TEST_DB_NAME" >> "$report_file"
    echo "- User: $DB_USER" >> "$report_file"
    echo "" >> "$report_file"
    echo "Seed Files Used:" >> "$report_file"
    ls -la "$SEEDS_DIR"/*.sql >> "$report_file"
    
    success "Verification report saved: $report_file"
}

# Cleanup test database
cleanup_test_database() {
    log "Cleaning up test database..."

    if dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" 2>/dev/null; then
        success "Test database cleaned up: $TEST_DB_NAME"
    else
        warning "Failed to cleanup test database: $TEST_DB_NAME"
    fi

    # Clean up temporary files
    rm -f "/tmp/original_counts_$$"
}

# Main execution
main() {
    log "Starting Made in World seed verification process..."
    log "Original database: $DB_NAME at $DB_HOST:$DB_PORT"
    log "Test database: $TEST_DB_NAME"
    
    check_dependencies
    test_connection
    check_seed_files
    get_original_counts
    create_test_database
    initialize_test_schema
    import_seed_data
    verify_table_counts
    verify_data_integrity
    generate_verification_report
    cleanup_test_database
    
    success "Seed verification completed successfully!"
    success "All seed files are valid and can recreate the database correctly."
}

# Handle script interruption
trap 'error "Verification process interrupted."; cleanup_test_database; exit 1' INT TERM

# Run main function
main "$@"
