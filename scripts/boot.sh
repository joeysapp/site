#!/usr/bin/env /bin/sh
# git checkout deploy
# git pull local deploy

#!/usr/bin/env sh
# Load environment variables from .env file
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
# https://stackoverflow.com/questions/43267413/how-to-set-environment-variables-from-env-file
echo "$ENV_FILE loaded, root cert=$ROOT_CERT"
node server/main.js
