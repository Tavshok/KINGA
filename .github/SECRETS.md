# GitHub Repository Secrets Configuration

This document lists all required GitHub repository secrets for the CI/CD pipeline.

## Required Secrets

Configure these secrets in your GitHub repository settings under **Settings → Secrets and variables → Actions**.

### Notification Services

| Secret Name | Description | Example Value | Required For |
|---|---|---|---|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL for CI/CD notifications | `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX` | Failure notifications, deployment alerts |
| `PAGERDUTY_API_KEY` | PagerDuty API key for critical alerts | `u+XXXXXXXXXXXXXXXXXXXXXX` | Critical failure escalation |

### Deployment

| Secret Name | Description | Example Value | Required For |
|---|---|---|---|
| `PRODUCTION_DEPLOY_KEY` | SSH key or API token for production deployment | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Production deployments |
| `STAGING_DEPLOY_KEY` | SSH key or API token for staging deployment | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Staging deployments |

### Monitoring

| Secret Name | Description | Example Value | Required For |
|---|---|---|---|
| `PROMETHEUS_URL` | Prometheus server URL | `http://prometheus.kinga.ai:9090` | Monitoring validation (G7) |
| `GRAFANA_URL` | Grafana server URL | `http://grafana.kinga.ai:3001` | Dashboard validation (G7) |
| `GRAFANA_API_KEY` | Grafana API key for programmatic access | `eyJrIjoiXXXXXXXXXXXXXXXX` | Dashboard provisioning |

### Code Coverage

| Secret Name | Description | Example Value | Required For |
|---|---|---|---|
| `CODECOV_TOKEN` | Codecov upload token | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Test coverage reporting |

## Setup Instructions

### 1. Slack Webhook

1. Go to https://api.slack.com/apps
2. Create a new app or select existing app
3. Enable "Incoming Webhooks"
4. Click "Add New Webhook to Workspace"
5. Select the channel for notifications (e.g., `#ci-cd-alerts`)
6. Copy the webhook URL and add as `SLACK_WEBHOOK_URL` secret

### 2. PagerDuty API Key

1. Log in to PagerDuty
2. Go to **Configuration → API Access**
3. Click "Create New API Key"
4. Give it a description (e.g., "KINGA CI/CD Pipeline")
5. Copy the API key and add as `PAGERDUTY_API_KEY` secret

### 3. Deployment Keys

For Manus-hosted deployments, deployment is handled through the Management UI. These secrets are optional and only needed if you're deploying to external infrastructure.

### 4. Monitoring URLs

Set these to your monitoring infrastructure URLs. If using the Docker Compose setup from `deployment/monitoring/`, use:

- `PROMETHEUS_URL`: `http://localhost:9090` (or your server IP)
- `GRAFANA_URL`: `http://localhost:3001` (or your server IP)

### 5. Codecov Token

1. Go to https://codecov.io
2. Sign in with GitHub
3. Add your repository
4. Copy the upload token
5. Add as `CODECOV_TOKEN` secret

## Verifying Secrets

After adding secrets, verify they're configured correctly:

```bash
# This will fail if secrets are missing
gh secret list
```

## Security Best Practices

- **Never commit secrets to the repository**
- Rotate secrets regularly (every 90 days)
- Use separate secrets for staging and production
- Limit secret access to necessary workflows only
- Monitor secret usage in GitHub Actions logs
- Revoke and regenerate secrets if compromised

## Troubleshooting

### "Secret not found" error

Ensure the secret name in the workflow YAML exactly matches the secret name in GitHub settings (case-sensitive).

### Webhook not receiving notifications

1. Verify the webhook URL is correct
2. Check the Slack channel permissions
3. Test the webhook manually:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message from KINGA CI/CD"}' \
     YOUR_WEBHOOK_URL
   ```

### PagerDuty alerts not triggering

1. Verify the API key has correct permissions
2. Check the service ID is correct
3. Test the integration manually via PagerDuty UI

## References

- [GitHub Actions Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [PagerDuty API Documentation](https://developer.pagerduty.com/docs/rest-api-v2/rest-api/)
