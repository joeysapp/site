#!/bin/sh
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
scp \
  "$SITE_DEPLOY_USER@$SITE_DEPLOY_HOST:$SITE_DEPLOY_NGINX_PATH/sites-available/joeys.app" \
  "$SITE_DEPLOY_USER@$SITE_DEPLOY_HOST:$SITE_DEPLOY_NGINX_PATH/nginx.conf" \
  "$SITE_LOCAL_PATH/scripts/nginx/"
