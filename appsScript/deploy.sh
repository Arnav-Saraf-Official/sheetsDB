#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# ==============================================================================
# CONFIGURATION
# Replace this with your actual Clasp Deployment ID
# ==============================================================================
DEPLOYMENT_ID="AKfycbwqo9jxBcoDenlgIgzk5Wjebfg2Gyu5W9qb6j3zvbtv10daXHPXQWfPDOC732-76v42"

echo "============= STARTING CLASP REDEPLOYMENT ============="

# 1. Push local code changes
echo "Step 1: Pushing latest code"

clasp push

# 2. Get the version description from the user
echo ""
echo "--------------------------------------------------------"
read -p "Enter a description for this new version: " VERSION_DESC
echo "--------------------------------------------------------"

# 3. Create a new immutable version and capture the output
echo ""
echo "Step 2: Creating a new script version..."
VERSION_OUTPUT=$(clasp version "$VERSION_DESC")
echo "$VERSION_OUTPUT"

# 4. Extract the version number using regex
# Matches the digit(s) in "Version X created."
if [[ $VERSION_OUTPUT =~ Version[[:space:]]+([0-9]+)[[:space:]]+created ]]; then
    VERSION_NUM="${BASH_REMATCH[1]}"
    echo "Successfully detected Version Number: $VERSION_NUM"
else
    echo "ERROR: Could not parse the version number from clasp output."
    exit 1
fi

# 5. Execute the redeployment
echo ""
echo "Step 3: Redeploying Deployment ID [$DEPLOYMENT_ID] to Version [$VERSION_NUM]..."
clasp redeploy "$DEPLOYMENT_ID" "$VERSION_NUM" "$VERSION_DESC"

echo ""
echo "============= REDEPLOYMENT COMPLETE SUCCESSFULLY ============="