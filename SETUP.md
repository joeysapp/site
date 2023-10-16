# https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu-20-04
# https://security.stackexchange.com/questions/90077/ssh-key-ed25519-vs-rsa#90083

# Local development
# ADD DEPLOY REMOTE THAT YOU WILL BE PUSH/PULLING TO
~~~git remote add deploy "$SITE_DEPLOY_USER@$SITE_DEPLOY_ADDRESS:$SITE_DEPLOY_PATH/.git"~~~



# Remote deployment
1. From your local deployment:
```bash
git push remote deploy
```


## Getting git repo
cd $SITE_LOCAL_PATH

## Add local remotes that you will be pulling or being pushed from
git remote add local "$SITE_LOCAL_USER@$SITE_LOCAL_ADDRESS:$SITE_LOCAL_PATH/.git"
git branch -u local/deploy deploy
git checkout deploy
git pull local deploy

x
