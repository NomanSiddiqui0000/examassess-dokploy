# 🗄️ Database Configuration Guide — ExamAssess

This guide explains how to switch the MongoDB connection between **local development** and **production**.

---

## Where to Change the Database Connection

There is **one place** to change depending on your environment:

| Environment | File to Edit | Variable |
|---|---|---|
| **Local Development** | `backend/.env` | `MONGODB_URI` |
| **Production (Docker / Dokploy)** | `docker-compose.yml` _or_ your hosting dashboard | `MONGODB_URI` |

---

## Local Development

Edit **`backend/.env`** and set the `MONGODB_URI` variable:

```env
# Local MongoDB (default)
MONGODB_URI=mongodb://localhost:27017/quiz-lms

# — OR — MongoDB Atlas (cloud)
# MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/quiz-lms
```

> **Note:** Make sure your local MongoDB server is running before starting the app.
> You can start it with `mongod` or via MongoDB Compass.

---

## Production Deployment

### Option A: Dokploy / Hosting Dashboard (Recommended)

Set the environment variable directly in your hosting platform's UI:

```
MONGODB_URI = mongodb+srv://<username>:<password>@<cluster>.mongodb.net/quiz-lms
```

No file changes needed — the container picks it up automatically.

### Option B: Docker Compose

Edit **`docker-compose.yml`** at the project root. Find the `MONGODB_URI` line and set it:

```yaml
environment:
  - MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/quiz-lms
```

Or create a **`.env`** file in the **project root** (next to `docker-compose.yml`):

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/quiz-lms
```

Docker Compose will automatically substitute `${MONGODB_URI}` from this file.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                   server.ts                         │
│                                                     │
│  1. Loads dotenv  →  reads backend/.env (dev only)  │
│  2. Checks process.env.MONGODB_URI exists           │
│  3. Connects to MongoDB using that URI              │
│                                                     │
│  In production (Docker), env vars come from the     │
│  container environment, NOT from .env files.        │
└─────────────────────────────────────────────────────┘
```

---

## MongoDB Atlas Setup (for Production)

1. Go to [MongoDB Atlas](https://cloud.mongodb.com) and create a free cluster
2. Under **Database Access** → create a database user
3. Under **Network Access** → add your server's IP (or `0.0.0.0/0` for testing)
4. Click **Connect** → **Drivers** → copy the connection string
5. Replace `<username>`, `<password>`, and `<cluster>` in the URI

### Example Production URI

```
mongodb+srv://myuser:mypassword@production-cluster.abc123.mongodb.net/quiz-lms
```

---

## All Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ Yes | MongoDB connection string |
| `JWT_SECRET` | ✅ Yes | Secret key for JWT tokens — **change in production!** |
| `JWT_EXPIRES_IN` | No | Token expiry (default: `7d`) |
| `PORT` | No | Server port (default: `5000`) |
| `NODE_ENV` | No | `development` or `production` |
| `SMTP_HOST` | No | Email SMTP host |
| `SMTP_PORT` | No | Email SMTP port |
| `SMTP_USER` | No | Email SMTP login |
| `SMTP_PASS` | No | Email SMTP password |
| `EMAIL_FROM` | No | Sender email address |
| `FRONTEND_URL` | No | Frontend base URL |
| `INVITATION_LOGIN_URL` | No | Login URL for email invitations |

> See [`backend/.env.example`](backend/.env.example) for a complete template.

---

## Quick Reference

```bash
# Start local MongoDB
mongod

# Start the backend (development)
cd backend
npm run dev

# Build & run with Docker
docker-compose up --build
```
