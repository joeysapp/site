#!/usr/bin/env sh
[ ! -f .env.local ] && echo "missing .env.local" && exit
export $(grep -v '^#' .env.local | xargs)
cd $SITE_PATH/frontend-dev
rm -r build
# Go down to npm and build, ensuring: cra/scripts/webpack.config.js ROOT='/public'
npm run build
scp -r \
  build/* \
  $SITE_DEPLOY_USER@$SITE_DEPLOY_HOST:$SITE_DEPLOY_PATH/files/public/
