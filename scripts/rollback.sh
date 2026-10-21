#!/usr/bin/env bash
set -euo pipefail

RELEASE="${RELEASE:-taskforge}"
NAMESPACE="${NAMESPACE:-taskforge}"
REVISION="${1:-}"

if [[ -z "$REVISION" ]]; then
  helm history "$RELEASE" -n "$NAMESPACE"
  echo "Usage: $0 <revision>"
  exit 1
fi

helm rollback "$RELEASE" "$REVISION" -n "$NAMESPACE"
kubectl rollout status "deploy/${RELEASE}-taskforge-api" -n "$NAMESPACE"
