# MongoDB Setup Guide for Quiz LMS

## Issue
The database seeding failed with error: `ECONNREFUSED ::1:27017`

This means MongoDB is not installed or not running on your system.

## Solution Options

### Option 1: Install MongoDB Locally (Recommended for Development)

#### Step 1: Download MongoDB
1. Go to: https://www.mongodb.com/try/download/community
2. Select:
   - Version: Latest (7.0 or higher)
   - Platform: Windows
   - Package: MSI
3. Click "Download"

#### Step 2: Install MongoDB
1. Run the downloaded `.msi` file
2. Choose "Complete" installation
3. **Important**: Check "Install MongoDB as a Service"
4. **Important**: Check "Install MongoDB Compass" (GUI tool)
5. Complete the installation

#### Step 3: Verify MongoDB is Running
Open Command Prompt and run:
```cmd
mongosh
```

If you see a MongoDB shell prompt, it's working! Type `exit` to close.

#### Step 4: Seed the Database
Once MongoDB is running, go back to your project:
```cmd
cd "C:\Users\Muhammad_Noman\Desktop\Quiz system\backend"
powershell.exe -ExecutionPolicy Bypass -Command "npm run seed"
```

---

### Option 2: Use MongoDB Atlas (Cloud Database - No Installation)

If you don't want to install MongoDB locally, use the free cloud version:

#### Step 1: Create MongoDB Atlas Account
1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Sign up for a free account
3. Create a free cluster (M0 tier)

#### Step 2: Get Connection String
1. In Atlas dashboard, click "Connect"
2. Choose "Connect your application"
3. Copy the connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)

#### Step 3: Update Backend .env File
1. Open: `C:\Users\Muhammad_Noman\Desktop\Quiz system\backend\.env`
2. Replace the MONGODB_URI line with your Atlas connection string:
```
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/quiz-lms?retryWrites=true&w=majority
```
3. Save the file

#### Step 4: Seed the Database
```cmd
cd "C:\Users\Muhammad_Noman\Desktop\Quiz system\backend"
powershell.exe -ExecutionPolicy Bypass -Command "npm run seed"
```

---

## Quick Start After MongoDB Setup

Once MongoDB is installed and running:

### Terminal 1 - Backend
```cmd
cd "C:\Users\Muhammad_Noman\Desktop\Quiz system\backend"
powershell.exe -ExecutionPolicy Bypass -Command "npm run seed"
powershell.exe -ExecutionPolicy Bypass -Command "npm run dev"
```

### Terminal 2 - Frontend
```cmd
cd "C:\Users\Muhammad_Noman\Desktop\Quiz system\frontend"
powershell.exe -ExecutionPolicy Bypass -Command "npm run dev"
```

### Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

### Default Login Credentials
- **Admin**: username `admin`, password `admin123`
- **User**: username `testuser`, password `user123`

---

## Current Status

✅ Node.js installed (v24.13.1)  
✅ Backend dependencies installed (198 packages)  
✅ Frontend dependencies installed (95 packages)  
❌ MongoDB not installed/running  
⏳ Database seeding pending  

## Next Step

**Choose one of the options above to set up MongoDB**, then run the seeding command to create the initial data (admin user, test user, sample MCQs, and sample quiz).
