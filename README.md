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

1. Clone this repo to your server
2. Configure Google OAuth (see above)
3. Run `docker compose up -d`
4. Point your domain to the server
5. First person from your company domain to sign in becomes Admin

## License

MIT
