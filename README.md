# ASTRA - Asset Tracking, Simplified.

A modern, full-stack asset management application with multi-tenancy support, Google OAuth, and role-based access control.

![ASTRA](frontend/public/logo.png)

## Features

- **Multi-Tenancy**: Organizations are automatically created based on email domain. Each company sees only their own data.
- **Google OAuth**: Secure sign-in with Google accounts
- **Asset Tracking**: Manage hardware (laptops, monitors, phones) and software subscriptions
- **Seat Management**: Track software subscription seats with assign/return functionality
- **User Management**: Role-based access control (Admin, Manager, Employee, Auditor)
- **Invite System**: Admins can generate invite links to add team members
- **Bulk Import**: Import assets via CSV
- **QR Codes**: Generate QR codes for asset labels
- **Audit History**: Complete event log for all asset and user changes
- **Dark Mode**: AMOLED-optimized dark theme
- **Modern UI**: Clean, responsive interface with animations

## Quick Start (One Command)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Run Everything

```bash
git clone https://github.com/yourusername/asset-management.git
cd asset-management
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

The first user from your email domain becomes the **Admin**. Subsequent users from the same domain join as **Employees**.

## Google OAuth Setup

To enable Google Sign-In, you need to create OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Set application type to **Web application**
6. Add authorized redirect URI: `http://localhost:8000/auth/google/callback`
7. Copy the Client ID and Client Secret

Add these to your `docker-compose.yml`:
```yaml
backend:
  environment:
    GOOGLE_CLIENT_ID: your-client-id
    GOOGLE_CLIENT_SECRET: your-client-secret
```

## Development Setup (Manual)

If you prefer running services separately for development:

### 1. Start the database

```bash
docker compose up -d db
```

### 2. Start the backend

```bash
cd backend
cp .env.example .env  # Edit with your settings
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Open the app

Visit [http://localhost:3000](http://localhost:3000)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL 16 |
| Auth | Google OAuth + JWT tokens |
| Container | Docker Compose |

## Multi-Tenancy

ASTRA supports multiple organizations in a single deployment:

| Scenario | What happens |
|----------|--------------|
| `alice@acme.com` signs in first | Creates "Acme Organization", becomes Admin |
| `bob@acme.com` signs in later | Joins "Acme Organization" as Employee |
| `carol@other.com` signs in | Creates "Other Organization", becomes Admin |
| `dave@gmail.com` signs in | Creates personal workspace |

Organizations are completely isolated - users can only see data from their own organization.

### Invite System

Admins can invite team members (especially useful for personal email users):

1. Go to **Users** page
2. Click **Invite Team**
3. Create an invite code
4. Share the link with your team member
5. They sign in and automatically join your organization

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage assets, users, create invites |
| **Manager** | Manage assets, view all users |
| **Employee** | View and manage assigned assets only |
| **Auditor** | Read-only access to all data and audit logs |

## Project Structure

```
asset-management/
├── backend/
│   ├── app/
│   │   ├── routers/       # API endpoints
│   │   ├── models.py      # Database models (User, Asset, Organization)
│   │   ├── schemas.py     # Pydantic schemas
│   │   ├── crud.py        # Database operations
│   │   ├── auth.py        # JWT authentication
│   │   └── main.py        # FastAPI app
│   ├── migrations/        # Alembic migrations
│   └── Dockerfile
├── frontend/
│   ├── app/               # Next.js pages
│   ├── components/        # UI components
│   ├── lib/               # Utilities & API client
│   └── Dockerfile
└── docker-compose.yml     # Full stack deployment
```

## Environment Variables

### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `JWT_SECRET` | Secret key for JWT tokens | (required in production) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | (required for OAuth) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | (required for OAuth) |
| `FRONTEND_URL` | Frontend URL for redirects | `http://localhost:3000` |

### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

## API Documentation

When the backend is running:
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Self-Hosting for Your Company

Want to run ASTRA for your company? Here's a complete guide to deploy it on your own server.

### Prerequisites

- A server (VPS or on-premise) with Docker installed
- A domain name (optional but recommended)
- Google Cloud account for OAuth

### Step 1: Set Up Your Server

Any Linux server with Docker works. Popular options:

| Provider | Cost | Notes |
|----------|------|-------|
| **Oracle Cloud** | **Free forever** | 2 VMs, 24GB RAM on ARM - best free option |
| **AWS EC2** | Free for 12 months | t2.micro, then ~$10/mo |
| **Hetzner** | €4/mo | Great value, EU-based |
| **DigitalOcean** | $6/mo | Easy to use |
| **Your own hardware** | Free | Old laptop, Raspberry Pi, etc. |

#### Oracle Cloud (Recommended for Free Hosting)

Oracle offers an **Always Free** tier that doesn't expire:
- 2 AMD VMs (1GB RAM each) OR 4 ARM VMs (24GB RAM total)
- 200GB storage
- 10TB bandwidth/month

**Drawbacks to be aware of:**
- Sign-up can be strict (use real info, may need retry)
- ARM instances often "out of capacity" - keep trying or use AMD
- Console UI is more complex than other providers
- Rare reports of account termination for inactivity (log in monthly)

Sign up: https://www.oracle.com/cloud/free/

Install Docker on your server:
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Step 2: Clone the Repository

```bash
git clone https://github.com/RoshanCP-boop/asset-management.git
cd asset-management
```

### Step 3: Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Go to **APIs & Services** → **OAuth consent screen**
   - Choose **External**
   - Fill in app name, support email
   - Add your domain to authorized domains
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `https://yourdomain.com/auth/google/callback`
   - (Or `http://your-server-ip:8000/auth/google/callback` if no domain)
5. Copy the **Client ID** and **Client Secret**

### Step 4: Configure Environment

Create a `.env` file in the backend folder:
```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Add your credentials:
```env
DATABASE_URL=postgresql://asset_user:asset_pass@db:5432/asset_db
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
JWT_SECRET=generate-a-long-random-string-here
FRONTEND_URL=https://yourdomain.com
```

Update `docker-compose.yml` if using a domain:
```yaml
backend:
  environment:
    FRONTEND_URL: https://yourdomain.com

frontend:
  environment:
    NEXT_PUBLIC_API_URL: https://yourdomain.com:8000
```

### Step 5: Start the Application

```bash
docker compose up -d
```

Your app is now running:
- Frontend: `http://your-server-ip:3000`
- Backend: `http://your-server-ip:8000`

### Step 6: Set Up Domain (Optional but Recommended)

**Don't have a domain?** Use a free subdomain:
- **DuckDNS** (free): Get `yourname.duckdns.org` at https://www.duckdns.org
- Just point it to your server IP and you're done

**Have your own domain?** Point your domain's DNS to your server IP.

Then set up a reverse proxy like Caddy for HTTPS:

**Using Caddy (easiest, auto-HTTPS):**
```bash
# Install Caddy
sudo apt install -y caddy

# Edit Caddy config
sudo nano /etc/caddy/Caddyfile
```

```
yourdomain.com {
    reverse_proxy localhost:3000
}

api.yourdomain.com {
    reverse_proxy localhost:8000
}
```

```bash
sudo systemctl restart caddy
```

### Step 7: First Login

1. Open your domain in a browser
2. Click **Sign in with Google**
3. The first person from your company domain becomes **Admin**
4. Invite your team from the **Users** page

## Sample Data

Want to see how the app looks with data? We've included a sample CSV file with 30 assets (20 hardware + 10 software):

```bash
# After logging in as Admin, go to Assets page and use "Import CSV"
# Upload the file: sample-data/assets.csv
```

The sample data includes:
- **Laptops**: MacBooks, Dell XPS, ThinkPads
- **Monitors**: Dell UltraSharp, LG 4K
- **Peripherals**: Keyboards, mice, headsets, webcams
- **Software**: JetBrains, GitHub, Figma, Microsoft 365, Slack, etc.

### Updating

To update to the latest version:
```bash
cd asset-management
git pull
docker compose down
docker compose up -d --build
```

### Backup

Your data is stored in a Docker volume. To backup:
```bash
docker exec asset_mgmt_db pg_dump -U asset_user asset_db > backup.sql
```

To restore:
```bash
cat backup.sql | docker exec -i asset_mgmt_db psql -U asset_user asset_db
```

---

## License

MIT
