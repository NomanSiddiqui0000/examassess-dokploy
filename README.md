# Quiz-Based Learning Management System

A comprehensive quiz-based LMS with role-based authentication for Admin and User roles, focused on MCQ assessments.

## Features

### Admin Features
- **User Management**: Create, edit, disable, and delete user accounts
- **MCQ Bank**: 
  - Create MCQs manually
  - Bulk upload MCQs via Excel/CSV files
  - Edit and delete MCQs
  - Search and filter by category/difficulty
- **Quiz Configuration**:
  - Create quizzes from MCQ bank
  - Configure number of questions, duration, passing marks
  - Enable/disable quizzes
- **Results Viewing**: View all user quiz attempts and results

### User Features
- **Quiz Taking**:
  - View available quizzes
  - Take quizzes with countdown timer
  - Auto-submit when time expires
  - Manual submit option
- **Results**: View quiz results with pass/fail status and score
- **History**: View all past quiz attempts

## Technology Stack

### Backend
- Node.js with Express
- TypeScript
- MongoDB with Mongoose
- JWT authentication
- bcrypt for password hashing
- xlsx for Excel file processing

### Frontend
- React with TypeScript
- Vite build tool
- React Router for navigation
- Axios for API calls
- Modern CSS with custom design system

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (running locally or connection string)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update the `.env` file with your MongoDB connection string if needed.

5. Seed the database with initial data:
```bash
npm run seed
```

This will create:
- Admin user: username `admin`, password `admin123`
- Test user: username `testuser`, password `user123`
- Sample MCQs and a quiz

6. Start the development server:
```bash
npm run dev
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## Default Login Credentials

### Admin
- Username: `admin`
- Password: `admin123`

### User
- Username: `testuser`
- Password: `user123`

## API Endpoints

### Authentication
- `POST /api/auth/admin/login` - Admin login
- `POST /api/auth/user/login` - User login

### Admin - User Management
- `POST /api/admin/users` - Create user
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### Admin - MCQ Management
- `POST /api/admin/mcqs` - Create MCQ
- `GET /api/admin/mcqs` - Get all MCQs
- `PUT /api/admin/mcqs/:id` - Update MCQ
- `DELETE /api/admin/mcqs/:id` - Delete MCQ
- `POST /api/admin/mcqs/bulk-upload` - Bulk upload MCQs
- `GET /api/admin/mcqs/template` - Download Excel template

### Admin - Quiz Management
- `POST /api/admin/quizzes` - Create quiz
- `GET /api/admin/quizzes` - Get all quizzes
- `PUT /api/admin/quizzes/:id` - Update quiz
- `DELETE /api/admin/quizzes/:id` - Delete quiz
- `PATCH /api/admin/quizzes/:id/toggle` - Enable/disable quiz

### Admin - Results
- `GET /api/admin/results` - Get all results
- `GET /api/admin/results/quiz/:quizId` - Get results by quiz
- `GET /api/admin/results/user/:userId` - Get results by user

### User - Quiz Taking
- `GET /api/user/quizzes` - Get available quizzes
- `POST /api/user/quizzes/:id/start` - Start quiz
- `POST /api/user/quizzes/:id/submit` - Submit quiz
- `GET /api/user/results` - Get user's results

## Excel Upload Format

For bulk MCQ upload, use the following columns:
- **Question Text** (required)
- **Option A** (required)
- **Option B** (required)
- **Option C** (required)
- **Option D** (required)
- **Correct Answer** (required) - A, B, C, or D
- **Category/Topic** (optional)
- **Difficulty Level** (optional) - Easy, Medium, or Hard

Download the template from the admin MCQ Bank page.

## Project Structure

```
Quiz system/
├── backend/
│   ├── src/
│   │   ├── controllers/     # Request handlers
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Authentication middleware
│   │   ├── routes/          # API routes
│   │   ├── utils/           # Utility functions
│   │   ├── scripts/         # Database seeding
│   │   └── server.ts        # Express server
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── src/
    │   ├── components/      # Reusable components
    │   ├── context/         # React context
    │   ├── pages/           # Page components
    │   │   ├── admin/       # Admin pages
    │   │   └── user/        # User pages
    │   ├── types/           # TypeScript types
    │   ├── utils/           # Utility functions
    │   ├── App.tsx          # Main app component
    │   └── main.tsx         # Entry point
    ├── package.json
    └── vite.config.ts
```

## Usage Guide

### For Admins

1. **Login** at `/admin/login`
2. **Create Users**: Go to User Management and add user accounts
3. **Add MCQs**: 
   - Manually add MCQs one by one, or
   - Download the template, fill it with MCQs, and bulk upload
4. **Create Quizzes**: 
   - Select MCQs from the bank
   - Configure quiz settings (duration, passing marks, etc.)
   - Enable the quiz to make it available to users
5. **View Results**: Check all quiz attempts and user performance

### For Users

1. **Login** at `/user/login`
2. **View Available Quizzes**: See all active quizzes on the dashboard
3. **Take a Quiz**:
   - Click "Start Quiz"
   - Answer all questions
   - Submit before time runs out (or it will auto-submit)
4. **View Results**: See your score and pass/fail status
5. **Check History**: View all your past quiz attempts

## License

ISC
