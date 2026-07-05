# EC2 expected terminal output checklist

Use this after running the recovery sequence on the EC2 host. Compare each command output line by line.

## 1) Stop old nginx if present

```bash
sudo systemctl stop nginx || true
```

Expected acceptable output:
- Usually no output
- If nginx is not installed yet, the `|| true` keeps the script moving even if systemd prints an error

Pass condition:
- Command returns to shell prompt

## 2) Delete old PM2 process if present

```bash
pm2 delete ivx-chat-api || true
```

Expected acceptable output:
- If PM2 is installed and process exists, output includes `ivx-chat-api` and `deleted`
- If PM2 is installed but process does not exist, output may say `Process or Namespace ivx-chat-api not found`
- If PM2 is missing, shell may print `pm2: command not found` and recovery is not complete yet

Pass condition:
- Preferably PM2 exists and the process is either deleted or already absent

## 3) Start the checked-in PM2 ecosystem

```bash
cd /home/user/ivx-app
CHAT_APP_ROOT=/home/user/ivx-app pm2 start expo/deploy/pm2/ecosystem.config.cjs
```

Expected healthy output:
- PM2 banner or startup table
- App name shown as `ivx-chat-api`
- Status shown as `online`
- Script shown as `node`
- Args include `--import tsx backend/express-chat-server.ts`

Example healthy indicators:
- `App [ivx-chat-api] launched`
- `online`
- `pid` has a numeric value

Fail indicators:
- `pm2: command not found`
- `Script not found`
- `Error: Cannot find module`
- `node: not found`
- Rapid restarts / `errored`

## 4) Persist PM2 state

```bash
pm2 save
```

Expected healthy output:
- Output includes `Saving current process list`
- Output includes `Successfully saved`

Fail indicators:
- `pm2: command not found`
- Permission errors writing PM2 dump

## 5) Check PM2 runtime state

```bash
pm2 status
```

Expected healthy output:
- Table includes `ivx-chat-api`
- `status` = `online`
- `↺` restart count is low, ideally `0` or stable
- `cpu` and `mem` fields are populated

Fail indicators:
- `errored`
- `stopped`
- Restart count increasing every time you run `pm2 status`

## 6) Verify backend health on localhost

```bash
curl -v http://127.0.0.1:3000/health
```

Expected healthy output:
- Verbose output shows `Connected to 127.0.0.1 (127.0.0.1) port 3000`
- Response status is `HTTP/1.1 200 OK` or `HTTP/1.1 200`
- Response body is JSON
- JSON should include a healthy marker such as `ok`, `healthy`, or similar server status payload

Pass condition:
- HTTP 200 with JSON body

Fail indicators:
- `Connection refused`
- `Operation timed out`
- HTML instead of JSON
- 5xx status

## 7) Install the checked-in nginx config

```bash
sudo cp /home/user/ivx-app/expo/deploy/nginx/ec2-node-http.conf /etc/nginx/conf.d/ivx-chat.conf
```

Expected healthy output:
- Usually no output

Pass condition:
- Command returns without error

Fail indicators:
- `No such file or directory`
- `/etc/nginx/conf.d` missing
- Permission denied

## 8) Remove default nginx sites if present

```bash
sudo rm -f /etc/nginx/conf.d/default.conf /etc/nginx/sites-enabled/default
```

Expected healthy output:
- No output

Pass condition:
- Command returns without error

## 9) Test nginx config

```bash
sudo nginx -t
```

Expected healthy output:
- `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok`
- `nginx: configuration file /etc/nginx/nginx.conf test is successful`

Fail indicators:
- `nginx: command not found`
- `unknown directive`
- `open() ... failed`
- Port binding or syntax errors

## 10) Enable nginx at boot

```bash
sudo systemctl enable nginx
```

Expected healthy output:
- Usually one of:
  - `Created symlink ...`
  - `Unit / service already enabled`

Fail indicators:
- `Unit nginx.service does not exist`

## 11) Restart nginx

```bash
sudo systemctl restart nginx
```

Expected healthy output:
- Usually no output

Pass condition:
- Command returns without error

Fail indicators:
- `Job for nginx.service failed`
- Service missing

## 12) Confirm listeners on 80 and 3000

```bash
sudo ss -ltnp | grep -E ':80|:3000' || true
```

Expected healthy output:
- One line showing a listener on `127.0.0.1:3000` or `0.0.0.0:3000` for the Node/PM2 backend
- One line showing a listener on `0.0.0.0:80` for nginx

Example healthy pattern:
- `LISTEN ... 127.0.0.1:3000 ...`
- `LISTEN ... 0.0.0.0:80 ...`

Fail indicators:
- No output
- Only port 80 appears but not 3000
- Only port 3000 appears but not 80

## 13) Verify nginx Host-header routing for API

```bash
curl -v -H 'Host: api.ivxholding.com' http://127.0.0.1/health
```

Expected healthy output:
- Connects to `127.0.0.1:80`
- Returns `HTTP/1.1 200 OK`
- Returns JSON from the backend health route

Pass condition:
- HTTP 200 with JSON body

This proves:
- nginx is running
- the `api.ivxholding.com` server block is active
- proxying to `127.0.0.1:3000` works

## 14) Verify nginx Host-header routing for chat web app

```bash
curl -v -H 'Host: chat.ivxholding.com' http://127.0.0.1/
```

Expected healthy output:
- Connects to `127.0.0.1:80`
- Returns `HTTP/1.1 200 OK`
- Returns HTML, not JSON
- Body should contain the exported web app shell, typically `<!DOCTYPE html>` or `<html`

Pass condition:
- HTTP 200 with HTML body

This proves:
- nginx is serving `/var/www/ivx-chat`
- `chat-hub.html` or exported index fallback is reachable

## 15) Probe public IP directly

```bash
curl -v http://108.132.7.57/
```

Expected healthy output on a fixed host:
- Connects to `108.132.7.57:80`
- Returns either:
  - `HTTP/1.1 200 OK` with HTML, or
  - nginx default/host-mismatch response if the Host header is not matched

Important note:
- Because the checked-in nginx file uses named `server_name` hosts, direct-IP requests may not prove the domain routing is correct
- This command is mainly useful to confirm the instance now returns bytes instead of hanging with an empty reply

Pass condition:
- The server responds with HTTP bytes instead of hanging forever or returning empty reply

## 16) Probe the public API domain

```bash
curl -v http://api.ivxholding.com/health
```

Expected healthy output:
- DNS resolves `api.ivxholding.com`
- Connects to public port `80`
- Returns `HTTP/1.1 200 OK`
- Returns JSON health payload

Pass condition:
- Public DNS + public HTTP + nginx proxy + backend all work together

Fail indicators:
- `Could not resolve host`
- Connect timeout
- Empty reply from server
- Non-200 status

## Final green-state summary

The host is recovered when all of the below are true:

- PM2 exists
- `pm2 status` shows `ivx-chat-api` as `online`
- `curl http://127.0.0.1:3000/health` returns HTTP 200 JSON
- `sudo nginx -t` is successful
- `sudo systemctl restart nginx` succeeds
- `ss -ltnp` shows listeners on both `:80` and `:3000`
- `curl -H 'Host: api.ivxholding.com' http://127.0.0.1/health` returns HTTP 200 JSON
- `curl -H 'Host: chat.ivxholding.com' http://127.0.0.1/` returns HTTP 200 HTML
- `curl http://api.ivxholding.com/health` returns HTTP 200 JSON publicly

## Fast diff against the last known broken state

If you still see any of the below, the host is not fixed yet:

- `pm2: command not found`
- `nginx: command not found`
- `Unit nginx.service not found`
- `curl http://127.0.0.1:3000/health` => `Connection refused`
- Public `curl` connects but returns zero bytes / empty reply
- No `LISTEN` line for port `3000`
- No `LISTEN` line for port `80`

## Checked-in files this checklist is based on

- `expo/deploy/scripts/ec2-bootstrap-amzn2023.sh`
- `expo/deploy/scripts/ec2-install-service.sh`
- `expo/deploy/scripts/ec2-node-deploy.sh`
- `expo/deploy/scripts/ec2-recover-chat-stack.sh`
- `expo/deploy/pm2/ecosystem.config.cjs`
- `expo/deploy/nginx/ec2-node-http.conf`
