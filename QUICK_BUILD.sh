#!/bin/bash

# ====================================================================
# PRIMEWAVE - Quick Android Build Script
# ====================================================================
# One-click build to Google Play release AAB
# ====================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android"
APP_DIR="$ANDROID_DIR/app"
OUTPUT_DIR="$APP_DIR/build/outputs/bundle/release"
KEYSTORE="$APP_DIR/primewave-release.keystore"

# Functions
print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local all_good=true
    
    # Check Java
    if ! command -v java &> /dev/null; then
        print_error "Java not found"
        print_info "Install: brew install openjdk@17"
        all_good=false
    else
        JAVA_VERSION=$(java -version 2>&1 | grep -oP 'version "\K[0-9]+')
        if [ "$JAVA_VERSION" -ge 11 ]; then
            print_success "Java $JAVA_VERSION found"
        else
            print_error "Java 11+ required (found $JAVA_VERSION)"
            all_good=false
        fi
    fi
    
    # Check Node
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found"
        print_info "Install: brew install node"
        all_good=false
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        print_success "Node.js $(node -v) found"
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm not found"
        all_good=false
    else
        print_success "npm $(npm -v) found"
    fi
    
    # Check keystore
    if [ ! -f "$KEYSTORE" ]; then
        print_error "Keystore not found at: $KEYSTORE"
        all_good=false
    else
        print_success "Keystore found"
    fi
    
    # Check gradle wrapper
    if [ ! -f "$ANDROID_DIR/gradlew" ]; then
        print_error "Gradle wrapper not found"
        all_good=false
    else
        print_success "Gradle wrapper found"
    fi
    
    if [ "$all_good" = false ]; then
        print_error "Prerequisites check failed!"
        return 1
    fi
    
    print_success "All prerequisites met!"
    return 0
}

check_passwords() {
    print_header "Checking Signing Configuration"
    
    if [ -z "$KEYSTORE_PASSWORD" ] && [ -z "$KEY_PASSWORD" ]; then
        print_warning "Passwords not set in environment"
        print_info "Add passwords to: $APP_DIR/build.gradle.properties"
        print_info "Or set environment variables:"
        echo -e "  export KEYSTORE_PASSWORD=\"your_password\""
        echo -e "  export KEY_PASSWORD=\"your_password\""
        
        # Try to read from build.gradle.properties
        if [ -f "$APP_DIR/build.gradle.properties" ]; then
            if grep -q "KEYSTORE_PASSWORD=your_" "$APP_DIR/build.gradle.properties"; then
                print_error "Passwords still have placeholder values!"
                return 1
            else
                print_success "Passwords found in build.gradle.properties"
            fi
        else
            print_error "build.gradle.properties not found"
            return 1
        fi
    else
        print_success "Passwords set in environment variables"
    fi
    
    return 0
}

install_dependencies() {
    print_header "Installing Dependencies"
    
    if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
        print_info "Running: npm install"
        cd "$SCRIPT_DIR"
        npm install
        print_success "Dependencies installed"
    else
        print_success "Dependencies already installed"
    fi
    
    cd "$SCRIPT_DIR"
}

build_aab() {
    print_header "Building AAB for Google Play"
    
    print_info "Running: ./gradlew bundleRelease"
    print_info "This may take 5-15 minutes..."
    echo ""
    
    cd "$ANDROID_DIR"
    
    if ./gradlew bundleRelease; then
        print_success "Build completed successfully!"
        return 0
    else
        print_error "Build failed!"
        return 1
    fi
}

verify_output() {
    print_header "Verifying Build Output"
    
    if [ ! -f "$OUTPUT_DIR/app-release.aab" ]; then
        print_error "AAB file not found at: $OUTPUT_DIR/app-release.aab"
        return 1
    fi
    
    FILE_SIZE=$(du -h "$OUTPUT_DIR/app-release.aab" | cut -f1)
    print_success "AAB file created: $FILE_SIZE"
    print_info "Location: $OUTPUT_DIR/app-release.aab"
    
    return 0
}

show_next_steps() {
    print_header "Next Steps"
    
    echo -e "${BLUE}1. Go to Google Play Console${NC}"
    echo -e "   https://play.google.com/console"
    echo ""
    echo -e "${BLUE}2. Select 'Primewave' app${NC}"
    echo ""
    echo -e "${BLUE}3. Click 'Releases' → 'Create new release'${NC}"
    echo ""
    echo -e "${BLUE}4. Upload AAB file:${NC}"
    echo -e "   ${YELLOW}$OUTPUT_DIR/app-release.aab${NC}"
    echo ""
    echo -e "${BLUE}5. Fill in release notes and submit for review${NC}"
    echo ""
    echo -e "${GREEN}✅ Your app will be live in 24-48 hours!${NC}"
}

# Main flow
main() {
    print_header "Primewave Android Build System"
    
    # Check prerequisites
    if ! check_prerequisites; then
        print_error "Prerequisites check failed. Cannot continue."
        exit 1
    fi
    
    # Check passwords
    if ! check_passwords; then
        print_error "Signing configuration incomplete. Cannot continue."
        exit 1
    fi
    
    # Install dependencies
    if ! install_dependencies; then
        print_error "Dependency installation failed."
        exit 1
    fi
    
    # Build AAB
    if ! build_aab; then
        print_error "Build failed. Check errors above."
        exit 1
    fi
    
    # Verify output
    if ! verify_output; then
        print_error "Output verification failed."
        exit 1
    fi
    
    # Show next steps
    show_next_steps
    
    exit 0
}

# Run main function
main "$@"
