#!/usr/bin/env /bin/sh
# git checkout deploy
# git pull local deploy

#!/usr/bin/env sh
# Load environment variables from .env file
ENV_FILE=.env.local
[ ! -f $ENV_FILE ] || export $(grep -v '^#' $ENV_FILE | xargs)
# https://stackoverflow.com/questions/43267413/how-to-set-environment-variables-from-env-file
echo "$ENV_FILE loaded, root cert=$ROOT_CERT"
nodemon server/main.js
