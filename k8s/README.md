# Raw Kubernetes manifests

These are a flattened subset of the Helm chart for comparison. Prefer the Helm chart for real installs:

```bash
helm upgrade --install taskforge ./helm/taskforge -n taskforge --create-namespace -f ./helm/taskforge/values-dev.yaml
```
