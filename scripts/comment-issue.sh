#!/usr/bin/env bash
#
# Posts a comment on the GitHub issue that triggered the workflow.
# The comment body is read from stdin so multi-line/markdown content
# doesn't need shell escaping.
#
# Usage:
#   ./scripts/comment-issue.sh <<'EOF'
#   ## Diagnostico
#   ...
#   EOF
#
# The issue number is read from the workflow event payload.
#

set -euo pipefail

ISSUE=$(jq -r '.issue.number // empty' "${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH not set}")
if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Error: no issue number in event payload" >&2
  exit 1
fi

BODY="$(cat)"
if [[ -z "$BODY" ]]; then
  echo "Error: empty comment body (pipe or heredoc the comment text into this script)" >&2
  exit 1
fi

gh issue comment "$ISSUE" --body "$BODY"
