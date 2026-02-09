#!/bin/bash

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
REPO_NAME="whatstrax-repo"
SERVICE_NAME="whatstrax"
BUCKET_NAME="${PROJECT_ID}-whatstrax-data" # Must match what you created

# Ensure Artifact Registry exists
gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=$REGION \
    --description="Whatstrax Docker Repository" \
    || echo "Repository likely already exists"

# 1. Build Backend Image
echo "Building Backend..."
gcloud builds submit . --tag $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/backend:latest

# 2. Build Frontend Image (Nginx)
echo "Building Frontend..."
cd client
gcloud builds submit . --tag $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/ingress:latest
cd ..

# 3. Deploy to Cloud Run
echo "Deploying to Cloud Run..."

# Replace placeholders in service.yaml
sed "s/CLOUD_STORAGE_BUCKET_NAME/$BUCKET_NAME/g" service.yaml > service.deploy.yaml
sed -i "s|INGRESS_IMAGE_URL|$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/ingress:latest|g" service.deploy.yaml
sed -i "s|BACKEND_IMAGE_URL|$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/backend:latest|g" service.deploy.yaml

gcloud run services replace service.deploy.yaml --region $REGION

# Force new revision to pick up latest images
echo "Forcing new revision..."
gcloud run services update $SERVICE_NAME --region $REGION --image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/ingress:latest

echo "Deployment submitted! Check the URL above."
echo "IMPORTANT: Don't forget to add the Cloud Run URL to your Google OAuth 'Authorized redirect URIs':"
echo "  https://<YOUR-SERVICE-URL>/auth/google/callback"
echo "AND update the ALLOWED_EMAILS environment variable in service.yaml or via console if not done already."
