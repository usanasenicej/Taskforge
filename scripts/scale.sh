#!/usr/bin/env bash
set -euo pipefail

RELEASE="${RELEASE:-taskforge}"
NAMESPACE="${NAMESPACE:-taskforge}"
REPLICAS="${1:-2}"

kubectl scale "deploy/${RELEASE}-taskforge-api" --replicas="$REPLICAS" -n "$NAMESPACE"
kubectl rollout status "deploy/${RELEASE}-taskforge-api" -n "$NAMESPACE"
