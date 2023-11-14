#!/usr/bin/env sh
# https://stackoverflow.com/questions/43267413/how-to-set-environment-variables-from-env-file
[ ! -f $1 ] && echo "missing env file (probably should be local)" && exit
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
echo $SITE_LOCAL_PATH
scp \
    "$SITE_LOCAL_PATH/.env.deploy" \
    "$SITE_DEPLOY_USER@$SITE_DEPLOY_HOST:$SITE_DEPLOY_PATH/.env.deploy"
