# FleetAnchor Pro — Google Drive Backup Setup

Weekly automated backups run every **Sunday at 2:00 AM WAT** and upload a full JSON
export of all database tables to a Google Drive folder. A success/failure email is sent
after each run. Backups older than 90 days are automatically deleted from Drive.

---

## What gets backed up

| Table | Contents |
|---|---|
| vendors | All vendor records including deleted ones |
| users | All user accounts (passwords excluded) |
| vehicles | Full vehicle registry |
| jobRequests | All maintenance job requests |
| estimates | All cost estimates |
| invoices | All invoice records |
| subscriptions | All subscription records |
| auditLogs | Last 10,000 audit entries |

---

## One-time setup (15 minutes)

### Step 1 — Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click **Select a project → New Project**
3. Name it `FleetAnchor-Backup` → **Create**

### Step 2 — Enable Google Drive API

1. Go to **APIs & Services → Library**
2. Search **Google Drive API** → **Enable**

### Step 3 — Create a Service Account

1. Go to **IAM & Admin → Service Accounts → Create Service Account**
2. Name: `fleetanchor-backup`
3. Description: `FleetAnchor Pro automated backup service`
4. Click **Create and Continue → Done**
5. Click on the service account you just created
6. Go to **Keys → Add Key → Create new key → JSON**
7. Download the JSON file — keep it safe

### Step 4 — Create a Google Drive backup folder

1. Go to https://drive.google.com
2. Create a new folder called `FleetAnchor Backups`
3. Right-click the folder → **Share**
4. Paste the service account email (from the JSON file, looks like `fleetanchor-backup@your-project.iam.gserviceaccount.com`)
5. Give it **Editor** access → **Send**
6. Copy the folder ID from the URL:
   `https://drive.google.com/drive/folders/`**`THIS_PART_IS_THE_FOLDER_ID`**

### Step 5 — Add Railway environment variables

Go to **Railway → Anchor-FleetPro → Variables** and add:

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The `client_email` from your downloaded JSON |
| `GOOGLE_PRIVATE_KEY` | The `private_key` from the JSON — **base64 encoded** (see below) |
| `GOOGLE_DRIVE_FOLDER_ID` | The folder ID from Step 4 |
| `BACKUP_NOTIFY_EMAIL` | Your email address for backup reports |

#### How to base64-encode the private key

The private key in the JSON looks like:
```
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
```

On Windows (PowerShell):
```powershell
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content key.txt -Raw)))
```

On Mac/Linux:
```bash
cat private_key.txt | base64 -w 0
```

Or use an online tool: https://www.base64encode.org — paste the full private key including the `-----BEGIN` and `-----END` lines.

### Step 6 — Test it

1. Go to the FleetAnchor Pro admin → **Settings**
2. Scroll to **Google Drive Backup**
3. Click **Run Backup Now**
4. You should see a success result within 30 seconds
5. Check your Google Drive folder — the backup file will be there
6. Check your email — a confirmation email will arrive

---

## Troubleshooting

| Error | Fix |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env var not set` | Add the variables to Railway |
| `Error: invalid_grant` | Private key is malformed — re-encode it as base64 |
| `Error: 403 The caller does not have permission` | Share the Drive folder with the service account email |
| `Error: 404 File not found` | GOOGLE_DRIVE_FOLDER_ID is wrong — check the folder URL |
| Backup succeeds but no email | Check BACKUP_NOTIFY_EMAIL is set and SENDGRID is working |

---

## Restoring from a backup

The backup file is a standard JSON file. To restore data:

1. Download the backup file from Google Drive
2. Open it — all tables are under named keys (`vendors`, `users`, etc.)
3. Use the data to manually re-insert records via the Prisma Studio or SQL
4. Or contact your developer to write a restore script from the JSON

For day-to-day protection, **Railway's built-in PostgreSQL backups** (7-day point-in-time) are faster to restore from.
