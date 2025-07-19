# Authentication Setup Guide

This application now includes a complete authentication system with email/password and Google OAuth support.

## Features

- ✅ User registration with email/password
- ✅ User login with email/password
- ✅ Google OAuth authentication
- ✅ Session management with PostgreSQL storage
- ✅ Password hashing with bcrypt
- ✅ Protected routes
- ✅ User profile management
- ✅ Responsive authentication UI

## Required Environment Variables

Add these variables to your `.env` file:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"

# Session Configuration
SESSION_SECRET="your-session-secret-change-this-in-production"

# Google OAuth Configuration (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="https://nomadai.replit.app/api/auth/google/callback"
```

## Database Setup

1. **Create your PostgreSQL database** (e.g., using Neon, Railway, or local PostgreSQL)

2. **Update your DATABASE_URL** in the `.env` file

3. **Push the database schema**:
   ```bash
   npm run db:push
   ```

## Google OAuth Setup (Optional)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client IDs
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - For development: `http://localhost:5000/api/auth/google/callback`
   - For Replit deployment: `https://nomadai.replit.app/api/auth/google/callback`
   - For production: `https://yourdomain.com/api/auth/google/callback`
7. Copy the Client ID and Client Secret to your `.env` file
8. Set the `GOOGLE_CALLBACK_URL` environment variable to match your deployment URL

## Usage

### Backend API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `GET /api/auth/status` - Check authentication status
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback

### Frontend Components

- `LoginForm` - Email/password login form
- `RegisterForm` - User registration form
- `UserMenu` - User dropdown menu with logout
- `useAuth` - Authentication hook
- `AuthProvider` - Authentication context provider

### Authentication Hook

```tsx
import { useAuth } from './hooks/useAuth';

function MyComponent() {
  const { user, loading, login, register, logout, loginWithGoogle } = useAuth();
  
  // Use authentication state and methods
}
```

## Database Schema

The users table includes:
- `id` - Primary key
- `email` - Unique email address
- `username` - Optional unique username
- `password` - Hashed password (optional for OAuth users)
- `firstName` - Optional first name
- `lastName` - Optional last name
- `emailVerified` - Email verification status
- `googleId` - Google OAuth ID (optional)
- `avatar` - Profile picture URL (optional)
- `createdAt` - Account creation timestamp
- `updatedAt` - Last update timestamp

## Security Features

- Passwords are hashed using bcrypt with 12 salt rounds
- Sessions are stored in PostgreSQL with secure cookies
- CSRF protection through SameSite cookies
- Input validation using Zod schemas
- SQL injection prevention through Drizzle ORM
- Secure session configuration for production

## Development vs Production

The application automatically switches between:
- **Development**: Memory storage (if no DATABASE_URL)
- **Production**: PostgreSQL storage (with DATABASE_URL)

## Replit Deployment

For Replit deployments, set these environment variables in your Replit project's Secrets:

```
DATABASE_URL=your-postgresql-connection-string
SESSION_SECRET=your-random-session-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://nomadai.replit.app/api/auth/google/callback
```

**Important**: The callback URL must exactly match what you register in Google Cloud Console.

## Troubleshooting

1. **Database connection issues**: Verify your DATABASE_URL is correct
2. **Session not persisting**: Check SESSION_SECRET is set
3. **Google OAuth "redirect_uri_mismatch" error**: 
   - Verify the `GOOGLE_CALLBACK_URL` environment variable matches exactly what's registered in Google Cloud Console
   - Ensure you've added `https://nomadai.replit.app/api/auth/google/callback` to your Google OAuth client's authorized redirect URIs
   - Check that the domain in the error message matches your environment variable
4. **CORS issues**: Ensure your frontend and backend origins are configured correctly

## Next Steps

- Add email verification
- Implement password reset functionality
- Add user profile editing
- Implement role-based access control
- Add account linking for multiple OAuth providers 