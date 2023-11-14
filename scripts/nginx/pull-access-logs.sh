#!/bin/sh
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
scp -r \
  "$SITE_DEPLOY_USER@$SITE_DEPLOY_HOST:$SITE_DEPLOY_PATH/scripts/nginx/logs" \
  "$SITE_LOCAL_PATH/scripts/nginx/logs/"
