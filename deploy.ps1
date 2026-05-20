#!/usr/bin/env pwsh
# Deploy script: pushes to deploy-dev and triggers OpenShift build
param(
    [string]$Message = "deploy"
)

$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "deploy-dev") {
    Write-Host "Switching to deploy-dev branch..." -ForegroundColor Yellow
    git checkout deploy-dev
}

git add -A
git commit -m $Message
git push origin deploy-dev

Write-Host "`nTriggering OpenShift build..." -ForegroundColor Cyan
oc start-build news-build -n atv-mc-newsletter-build --follow

Write-Host "`nBuild complete. New image will be picked up by the Knative service." -ForegroundColor Green
