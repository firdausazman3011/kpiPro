# KPI Management System

A comprehensive web application for tracking and managing Key Performance Indicators (KPIs) within an organization. Built with Node.js, Express.js, and MongoDB.

## Features

- User authentication (Manager and Staff roles)
- KPI creation and management
- Real-time progress tracking
- Performance analytics
- Staff management
- Comment system for collaboration
- Responsive design using Bootstrap 5

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd kpi-management-system
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/kpi-management
SESSION_SECRET=your-secret-key-here
```

4. Start MongoDB service on your machine

5. Start the application:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The application will be available at `http://localhost:3000`

## Project Structure

```
kpi-management-system/
├── models/             # Database models
├── routes/            # Route handlers
├── views/             # EJS templates
│   ├── auth/         # Authentication views
│   ├── manager/      # Manager views
│   ├── staff/        # Staff views
│   └── layouts/      # Layout templates
├── public/           # Static files
│   ├── css/         # Stylesheets
│   └── js/          # Client-side scripts
├── middleware/       # Custom middleware
├── server.js        # Application entry point
└── package.json     # Project dependencies
```

## Usage

1. Register as a Manager or Staff member
2. Login with your credentials
3. Managers can:
   - Create and manage KPIs
   - Assign KPIs to staff members
   - Track staff performance
   - View analytics
4. Staff members can:
   - View assigned KPIs
   - Update progress
   - Add comments
   - Track personal performance

## Technologies Used

- Node.js & Express.js
- MongoDB & Mongoose
- EJS templating engine
- Bootstrap 5
- Express Session
- bcryptjs for password hashing
- JWT for authentication

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 