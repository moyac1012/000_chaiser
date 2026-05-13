# VPS デプロイ (Ubuntu + systemd + cloudflared)

このガイドの前提:
- Ubuntu 22.04 以上
- Cloudflare 管理のドメイン
- VPS への SSH アクセス

このアプリは 3 つのプロセスで動きます:
- Next.js Web サーバ (port 3000)
- Bun WebSocket サーバ (port 8080)
- Caddy リバースプロキシ (port 8081)
  - `/ws/match` を WS サーバへ、それ以外を Next.js へルーティングする

cloudflared は Caddy のポートを HTTPS/WSS で公開し、インバウンドポートを開けずに運用します。

## 1) サービスユーザーとディレクトリの作成

```bash
sudo adduser --disabled-password --gecos "" chaser
sudo mkdir -p /opt/chaser-web/releases /var/lib/chaser-web
sudo chown -R chaser:chaser /opt/chaser-web /var/lib/chaser-web
```

## 2) Bun のインストール (サービスユーザーで実行)

```bash
sudo -iu chaser
curl -fsSL https://bun.com/install | bash
exit
```

## 3) 環境変数ファイル

`/etc/chaser-web.env` を作成し、サービスユーザーが読めるようにします。

```bash
sudo touch /etc/chaser-web.env
sudo chown chaser:chaser /etc/chaser-web.env
sudo chmod 600 /etc/chaser-web.env
```

例:

```env
NODE_ENV=production
DATABASE_PATH=/var/lib/chaser-web/chaser.sqlite
WS_SERVER_PORT=8080
WS_SERVER_BASE_URL=http://127.0.0.1:8080
NEXT_PUBLIC_WS_URL=wss://app.example.com/ws/match
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

注意: `NEXT_PUBLIC_*` はビルド時に埋め込まれます。変更した場合は再ビルドしてから再起動してください。

## 4) Caddy リバースプロキシ (単一ホスト名)

`/etc/caddy/Caddyfile` を作成します。

```caddy
:8081 {
  handle /ws/match* {
    reverse_proxy 127.0.0.1:8080
  }

  handle {
    reverse_proxy 127.0.0.1:3000
  }
}
```

Caddy をリロード:

```bash
sudo systemctl reload caddy
```

未起動の場合:

```bash
sudo systemctl enable --now caddy
```

## 5) systemd ユニット (web + ws)

`/etc/systemd/system/chaser-web.service` を作成:

```ini
[Unit]
Description=chaser-web (Next.js)
After=network.target

[Service]
Type=simple
User=chaser
Group=chaser
WorkingDirectory=/opt/chaser-web/current
EnvironmentFile=/etc/chaser-web.env
ExecStart=/home/chaser/.bun/bin/bun --bun next start -p 3000
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/chaser-ws.service` を作成:

```ini
[Unit]
Description=chaser-web (WS server)
After=network.target

[Service]
Type=simple
User=chaser
Group=chaser
WorkingDirectory=/opt/chaser-web/current
EnvironmentFile=/etc/chaser-web.env
ExecStart=/home/chaser/.bun/bin/bun --bun server/wsServer.ts
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

有効化と起動（初回デプロイ後に `/opt/chaser-web/current` が作成されている前提）:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chaser-web.service chaser-ws.service
```

Bun のパスが異なる場合は `ExecStart` を合わせてください。

ログ:

```bash
journalctl -u chaser-web.service -f
journalctl -u chaser-ws.service -f
```

## 6) cloudflared トンネル (単一ホスト名)

Web と WebSocket を同じホスト名で公開します。

```bash
sudo -iu chaser
cloudflared tunnel login
cloudflared tunnel create chaser-web
cloudflared tunnel route dns chaser-web app.example.com
```

`/home/chaser/.cloudflared/config.yml` を作成:

```yaml
tunnel: <tunnel-id>
credentials-file: /home/chaser/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: app.example.com
    service: http://localhost:8081
  - service: http_status:404
```

`/etc/systemd/system/cloudflared.service` を作成:

```ini
[Unit]
Description=cloudflared tunnel
After=network.target

[Service]
Type=simple
User=chaser
ExecStart=/usr/bin/cloudflared --config /home/chaser/.cloudflared/config.yml tunnel run chaser-web
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

有効化と起動:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared.service
```

## 7) GitHub Actions CD (git pull なし)

`.github/workflows/deploy.yml` は以下の secrets を前提にしています:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY` (private key)
- `VPS_PORT` (デフォルトなら "22")
- `NEXT_PUBLIC_WS_URL` (例: `wss://app.example.com/ws/match`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`

`NEXT_PUBLIC_*` はビルド時に埋め込まれるため、`/etc/chaser-web.env` の値と揃えてください。

deploy ユーザーが service を再起動できるように sudoers を追加します:

```bash
sudo visudo -f /etc/sudoers.d/chaser-web
```

例:

```
chaser ALL=NOPASSWD:/bin/systemctl restart chaser-web.service, /bin/systemctl restart chaser-ws.service, /bin/systemctl restart caddy.service
```
