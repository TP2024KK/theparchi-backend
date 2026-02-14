# TheParchi - Backend

A modern, secure backend for TheParchi challan management system.

## 🚀 Features

- ✅ User authentication (Email/Password + Password Reset via OTP)
- ✅ Company & team management with role-based access
- ✅ Challan creation & management
- ✅ Return challan handling
- ✅ Party/Customer management
- ✅ GST calculations (flexible - works with or without GST)
- ✅ Secure JWT authentication
- ✅ Email notifications via Resend
- ✅ RESTful API design

## 📋 Prerequisites

Before you begin, make sure you have:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **MongoDB** - Choose one:
  - Local MongoDB installation, OR
  - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free cloud database)
- **Resend Account** (free) - [Sign up here](https://resend.com)

## 🛠️ Installation & Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment Variables

1. Copy the example env file:
```bash
cp .env.example .env
```

2. Open `.env` and update these values:

```env
# Database - Choose one option:

# Option A: Local MongoDB
MONGODB_URI=mongodb://localhost:27017/theparchi

# Option B: MongoDB Atlas (recommended for beginners)
# Get this from: https://cloud.mongodb.com -> Create Cluster -> Connect
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/theparchi

# JWT Secret (IMPORTANT: Change this!)
JWT_SECRET=your-random-secret-key-at-least-32-characters-long

# Resend API Key
# Get this from: https://resend.com/api-keys
RESEND_API_KEY=re_your_actual_api_key_here

# Email Settings
FROM_EMAIL=noreply@yourdomain.com  # For production, use verified domain
FROM_NAME=TheParchi

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

### Step 3: Get Your MongoDB Connection String

**If using MongoDB Atlas (recommended):**

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for free account
3. Create a new cluster (free tier)
4. Click "Connect" -> "Connect your application"
5. Copy the connection string
6. Replace `<password>` with your database password
7. Replace `<dbname>` with `theparchi`

**If using local MongoDB:**
- Just use: `mongodb://localhost:27017/theparchi`

### Step 4: Get Your Resend API Key

1. Go to [Resend](https://resend.com)
2. Sign up for free account
3. Go to API Keys section
4. Create a new API key
5. Copy it to your `.env` file

### Step 5: Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

You should see:
```
✅ MongoDB Connected: cluster0.xxxxx.mongodb.net
╔════════════════════════════════════════╗
║                                        ║
║     🚀 TheParchi Backend Running      ║
║                                        ║
║     Environment: development           ║
║     Port: 5000                         ║
║                                        ║
╚════════════════════════════════════════╝
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new company & owner
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/forgot-password` - Request password reset OTP
- `POST /api/auth/reset-password` - Reset password with OTP
- `POST /api/auth/change-password` - Change password (logged in)

### Challans
- `GET /api/challans` - Get all challans (with filters)
- `POST /api/challans` - Create new challan
- `GET /api/challans/:id` - Get single challan
- `PUT /api/challans/:id` - Update challan
- `DELETE /api/challans/:id` - Delete challan
- `GET /api/challans/stats` - Get statistics

### Return Challans
- `GET /api/return-challans` - Get all return challans
- `POST /api/return-challans` - Create return challan
- `GET /api/return-challans/:id` - Get single return challan
- `PUT /api/return-challans/:id` - Update return challan
- `DELETE /api/return-challans/:id` - Delete return challan

### Parties (Customers/Suppliers)
- `GET /api/parties` - Get all parties
- `POST /api/parties` - Create new party
- `GET /api/parties/:id` - Get single party
- `PUT /api/parties/:id` - Update party
- `DELETE /api/parties/:id` - Deactivate party

### Team Management
- `GET /api/team` - Get all team members
- `POST /api/team` - Add team member (Owner/Admin only)
- `PUT /api/team/:id` - Update team member (Owner/Admin only)
- `DELETE /api/team/:id` - Remove team member (Owner only)

### Company
- `GET /api/company` - Get company details
- `PUT /api/company` - Update company (Owner/Admin only)
- `PUT /api/company/settings` - Update settings (Owner/Admin only)

## 🔐 Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## 👥 User Roles & Permissions

- **Owner**: Full access to everything
- **Admin**: Can manage team, settings, and all modules
- **Manager**: Custom permissions per module
- **Staff**: Limited permissions as assigned

## 🧪 Testing the API

### Using Postman

1. **Signup:**
```json
POST http://localhost:5000/api/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "companyName": "ABC Traders",
  "phone": "9876543210"
}
```

2. **Login:**
```json
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

Save the `token` from the response.

3. **Create a Party:**
```json
POST http://localhost:5000/api/parties
Authorization: Bearer <your-token-here>
Content-Type: application/json

{
  "name": "XYZ Suppliers",
  "phone": "9876543210",
  "email": "xyz@example.com",
  "type": "customer",
  "gstNumber": "27AAPFU0939F1ZV"
}
```

4. **Create a Challan:**
```json
POST http://localhost:5000/api/challans
Authorization: Bearer <your-token-here>
Content-Type: application/json

{
  "party": "<party-id-from-previous-step>",
  "items": [
    {
      "itemName": "Product A",
      "quantity": 10,
      "unit": "pcs",
      "rate": 100,
      "gstRate": 18
    }
  ],
  "notes": "First challan"
}
```

## 🚀 Deployment

### Deploy to Render (Free)

1. Create account on [Render](https://render.com)
2. Click "New +" -> "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add environment variables from your `.env` file
6. Click "Create Web Service"

### Deploy to Railway (Free)

1. Create account on [Railway](https://railway.app)
2. Click "New Project" -> "Deploy from GitHub"
3. Select your repository
4. Add environment variables
5. Deploy!

## 📝 Environment Variables for Production

Make sure to set these in your production environment:

- `MONGODB_URI` - Your production MongoDB connection string
- `JWT_SECRET` - A strong, random secret key
- `RESEND_API_KEY` - Your Resend API key
- `FROM_EMAIL` - Verified email domain
- `FRONTEND_URL` - Your production frontend URL
- `NODE_ENV=production`

## 🐛 Troubleshooting

### "MongooseError: The `uri` parameter to `openUri()` must be a string"
- Check your `MONGODB_URI` in `.env` is correct
- Make sure `.env` file is in the root directory

### "Error: Invalid login credentials"
- Verify email/password are correct
- Check if user account is active

### Emails not sending
- Verify `RESEND_API_KEY` is correct
- Check Resend dashboard for quota/errors
- For production, verify your sending domain

### Port already in use
- Change `PORT` in `.env` file
- Or kill the process using port 5000

## 📚 Next Steps

1. ✅ Backend is running
2. ➡️ Build the frontend (React app)
3. ➡️ Connect frontend to backend
4. ➡️ Deploy both to production

## 🤝 Support

If you encounter any issues:
1. Check the console logs for errors
2. Verify all environment variables are set correctly
3. Make sure MongoDB is running/accessible
4. Check that ports are not blocked

## 📄 License

This project is private and proprietary.
