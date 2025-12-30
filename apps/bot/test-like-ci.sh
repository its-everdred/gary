#!/bin/bash

echo "🔄 Testing with CI-like conditions..."

echo "📝 Test 1: Run tests multiple times to catch flaky behavior"
bun test --rerun-each 2 --bail=5 2>/dev/null

if [ $? -ne 0 ]; then
    echo "❌ Tests fail when run multiple times (like CI parallelization)"
    echo ""
    echo "📝 Test 2: Run individual test files that might conflict"
    echo "Testing messageAccessSecurity + voteResultService combo..."
    bun test src/tests/messageAccessSecurity.test.ts src/tests/voteResultService.test.ts --bail=1
    
    if [ $? -ne 0 ]; then
        echo "❌ These two files conflict when run together"
    fi
    
    echo ""
    echo "📝 Test 3: Run all tests at once (CI runs all together)"
    bun test --bail=1
    
    exit 1
else
    echo "✅ Tests pass in CI-like conditions"
fi