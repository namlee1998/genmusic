# Upgrading to Single-User Local-First Architecture

This project has been updated to remove Supabase OAuth, user management, profile settings, and quota limits, pivoting to a local-first single-user configuration.

To upgrade your local dev environment, run the following commands:

## 1. Prune Obsolete NPM Dependencies
Prune deleted packages (`@supabase/supabase-js`, `bcryptjs`, `jsonwebtoken` in backend, and stores in frontend):
```bash
# In backend/
cd backend
npm install

# In frontend/
cd ../frontend
npm install
```

## 2. Sync Database Schema
Remove obsolete tables (`User`, `ProjectMembership`, `Profile`, etc.) from your local SQLite database:
```bash
# In backend/
cd ../backend
npx prisma db push
```

## 3. Launch Development Servers
- Backend: `npm run dev` (Runs on port 3000)
- Frontend: `npm run dev` (Runs on port 5173)

---

### Note for AI Agents / Copilots:
If you encounter:
- `MODULE_NOT_FOUND` errors referencing `MembershipService`, `QuotaService`, or `AuthService`
- Database exceptions mentioning `User` or `ProjectMembership` relations
Make sure to check if you are importing obsolete files, or run the steps above to sync the environment.
