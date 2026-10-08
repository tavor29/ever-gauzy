#!/usr/bin/env sh
# Prints a live board link for one project, using your Gauzy login.
#   GAUZY_TOKEN=<access token> ./scripts/live-board-ticket.sh <project-id> [gauzy-api-url] [live-board-url]
# The access token is the "token" value Gauzy's web app keeps after you sign in.
set -eu
PROJECT_ID="$1"
API="${2:-http://localhost:3000}"
LIVE="${3:-http://localhost:8090}"
TICKET=$(curl -fsS -H "Authorization: Bearer ${GAUZY_TOKEN:?set GAUZY_TOKEN}" \
	"$API/api/live-board/ticket?boardId=$PROJECT_ID" | sed -E 's/.*"ticket":"([^"]+)".*/\1/')
echo "$LIVE/?ticket=$TICKET   (valid for 60 seconds)"
