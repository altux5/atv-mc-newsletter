#!/usr/bin/env pwsh
# Deploy script: pushes to deploy-dev, triggers OpenShift build, and rolls out new image
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

Write-Host "`nBuilding frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

git add dist/
git commit -m "Rebuild dist" --allow-empty
git push origin deploy-dev

Write-Host "`nTriggering OpenShift build..." -ForegroundColor Cyan
oc start-build news-build -n atv-mc-newsletter-build --follow

Write-Host "`nUpdating Knative service with new image..." -ForegroundColor Cyan
$newImage = oc get istag news-build:latest -n atv-mc-newsletter-build -o jsonpath='{.image.dockerImageReference}'
$patch = "{`"spec`":{`"template`":{`"spec`":{`"containers`":[{`"name`":`"news-dev`",`"image`":`"$newImage`"}]}}}}"
oc patch ksvc/news-dev -n atv-mc-newsletter-development --type merge -p $patch

Write-Host "`nDone! New revision deployed." -ForegroundColor Green
oc get revisions -n atv-mc-newsletter-development -l serving.knative.dev/service=news-dev --sort-by=.metadata.creationTimestamp | Select-Object -Last 2
