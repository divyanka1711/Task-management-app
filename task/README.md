# Team Task App

A simple full-stack team task management app for projects, members, tasks, dashboard stats, and role-based access.

## Tech Stack

- Frontend: React, Vite, CSS
- Backend: Node.js, Express
- Database: PostgreSQL
- Auth: JWT with hashed passwords
- Deployment: Railway

## Features

- Signup and login with JWT authentication
- Create projects, where the creator becomes Admin
- Admin can add or remove project members
- Admin can create, assign, update, and delete tasks
- Members can view projects and update only their assigned tasks
- Dashboard shows total tasks, status counts, tasks per user, and overdue tasks

## Simple Database Schema

- `users`: name, email, password hash
- `projects`: name, description, creator
- `project_members`: project, user, role (`admin` or `member`)
- `tasks`: project, title, description, due date, priority, status, assignee

The server creates these tables automatically on startup.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a PostgreSQL database and set backend environment variables:

```bash
cp server/.env.example server/.env
```

Update `DATABASE_URL` and `JWT_SECRET` in `server/.env`.

The frontend works through the Vite proxy in local development. If you want to point it to a different API URL, copy `client/.env.example` to `client/.env` and update `VITE_API_URL`.

3. Start the app:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:5000`

Health check: `http://localhost:5000/api/health`

## Useful Scripts

```bash
npm run dev
npm run build
npm start
npm run check
```

## Railway Deployment

1. Push this folder to GitHub.
2. Create a new Railway project from the GitHub repository.
3. Add a Railway PostgreSQL database.
4. Add environment variables to the web service:

```bash
DATABASE_URL=<Railway PostgreSQL connection string>
JWT_SECRET=<strong random secret>
NODE_ENV=production
```

5. Railway can use the included `railway.json`.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

In production, Express serves the built React app and the API from the same Railway URL.

## Submission

- Live application URL: add your Railway URL here
- GitHub repository: add your GitHub URL here
- Demo video: record a 2-5 minute walkthrough showing signup, project creation, member addition, task assignment, dashboard stats, and member status updates
