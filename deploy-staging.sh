#!/bin/bash

# Staging Deployment Script
# Deploys to whatstrax-staging service for testing enhancements

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
REPO_NAME="whatstrax-repo"
SERVICE_NAME="whatstrax-staging"
BUCKET_NAME="${PROJECT_ID}-whatstrax-staging-data"

echo "=== Deploying to STAGING environment ==="
echo "Service: $SERVICE_NAME"
echo "Bucket: $BUCKET_NAME"
echo ""

# Create staging bucket if it doesn't exist
echo "Ensuring staging bucket exists..."
gsutil mb -l $REGION gs://$BUCKET_NAME 2>/dev/null || echo "Bucket likely already exists"

# Ensure Artifact Registry exists
gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=$REGION \
    --description="Whatstrax Docker Repository" \
    || echo "Repository likely already exists"

# 1. Build Backend Image
echo "Building Backend..."
gcloud builds submit . --tag $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/backend:staging

# 2. Build Frontend Image (Nginx)
echo "Building Frontend..."
cd client
gcloud builds submit . --tag $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/ingress:staging
cd ..

# 3. Deploy to Cloud Run
echo "Deploying to Cloud Run..."

# Replace placeholders in service-staging.yaml
sed "s/CLOUD_STORAGE_BUCKET_NAME_STAGING/$BUCKET_NAME/g" service-staging.yaml > service-staging.deploy.yaml
sed -i "s|INGRESS_IMAGE_URL|$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/ingress:staging|g" service-staging.deploy.yaml
sed -i "s|BACKEND_IMAGE_URL|$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/backend:staging|g" service-staging.deploy.yaml

gcloud run services replace service-staging.deploy.yaml --region $REGION

# Force new revision to pick up latest images
echo "Forcing new revision..."
gcloud run services update $SERVICE_NAME --region $REGION --image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/ingress:staging

echo ""
echo "=== Staging Deployment Complete ==="
echo "IMPORTANT: Add the staging URL to Google OAuth 'Authorized redirect URIs':"
echo "  https://<STAGING-SERVICE-URL>/auth/google/callback"
