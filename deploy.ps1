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

Write-Host "`nUpdating Knative service with new image, DB secret, and min-scale..." -ForegroundColor Cyan
$newImage = oc get istag news-build:latest -n atv-mc-newsletter-build -o jsonpath='{.image.dockerImageReference}'
# Build the patch as an object and serialize it, so the image, the DB secret
# (envFrom) and the min-scale annotation are all applied together. Note: oc set
# env does NOT work on Knative services, which is why the secret is wired here.
$patchObj = @{
    spec = @{
        template = @{
            metadata = @{
                annotations = @{
                    'autoscaling.knative.dev/min-scale' = '1'
                }
            }
            spec = @{
                containers = @(
                    @{
                        name    = 'news-dev'
                        image   = $newImage
                        envFrom = @(
                            @{ secretRef = @{ name = 'newsletter-db' } }
                        )
                        # Newsletter email distribution (SMTP relay authorises by
                        # allow-listed egress IP, so there is no SMTP user/password).
                        env     = @(
                            @{ name = 'MAIL_ENABLED';    value = '1' }
                            @{ name = 'MAIL_RELAY_HOST';  value = 'mailrelay-internal.infineon.com' }
                            @{ name = 'MAIL_RELAY_PORT';  value = '25' }
                            @{ name = 'MAIL_FROM';        value = 'NoReply@infineon.com' }
                            @{ name = 'PUBLIC_BASE_URL';  value = 'https://atv-mc-newsletter.eu-de-3.icp.infineon.com' }
                        )
                    }
                )
            }
        }
    }
}
$patch = $patchObj | ConvertTo-Json -Depth 10 -Compress
oc patch ksvc/news-dev -n atv-mc-newsletter-development --type merge -p $patch

Write-Host "`nDone! New revision deployed." -ForegroundColor Green
oc get revisions -n atv-mc-newsletter-development -l serving.knative.dev/service=news-dev --sort-by=.metadata.creationTimestamp | Select-Object -Last 2
