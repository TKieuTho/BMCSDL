# Student Management System

A Node.js web application for managing students, classes, and grades with SQL Server integration.

## Features

- User authentication (login system)
- View list of classes
- View student details and grades for each class
- Responsive design
- SQL Server database integration

## Prerequisites

- Node.js (v14 or higher)
- SQL Server
- npm (Node Package Manager)

## Setup Instructions

1. Clone the repository:
```bash
git clone <repository-url>
cd student-management-system
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
   - Open SQL Server Management Studio
   - Execute the SQL scripts in `database.sql`

4. Configure environment variables:
   - Rename `.env.example` to `.env`
   - Update the database connection details and session secret

5. Start the application:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Default Login Credentials

- Username: admin
- Password: admin123

## Database Schema

The application uses the following tables:
- Users: Store user credentials
- Classes: Store class information
- Students: Store student information
- Grades: Store student grades for each class

## Technologies Used

- Node.js
- Express.js
- SQL Server
- EJS (Embedded JavaScript templates)
- CSS3 