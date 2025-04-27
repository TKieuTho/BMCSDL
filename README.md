
## Prerequisites

- Node.js (v14 or higher)
- SQL Server
- npm (Node Package Manager)

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/TKieuTho/BMCSDL
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
   - Open SQL Server Management Studio
   - Execute the SQL scripts in `QLSVNhom.sql`

4. Configure environment variables:
   - Rename `.env.example` to `.env`
   - Update the database connection details.

5. Start the application:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Default Login Credentials

- Username: admin
- Password: admin123
