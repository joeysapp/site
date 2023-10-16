#!/usr/env /bin/sh
# git checkout deploy
# git pull local deploy

sh scripts/setup-env.sh .env.deploy
node server/main.js
