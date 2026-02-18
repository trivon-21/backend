# AirLux Backend

Backend API server for the AirLux application built with Node.js, Express, and MongoDB.

## Technologies

- **Node.js** - JavaScript runtime
- **Express** - Web application framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **JWT** - JSON Web Tokens for authentication
- **bcryptjs** - Password hashing
- **express-validator** - Request validation middleware
- **dotenv** - Environment variable management
- **CORS** - Cross-Origin Resource Sharing

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.js              # Database configuration
│   ├── controllers/
│   │   └── auth.controller.js # Authentication logic
│   ├── middleware/
│   │   └── auth.middleware.js # JWT verification middleware
│   ├── models/
│   │   └── User.js            # User model schema
│   └── routes/
│       └── auth.routes.js     # Authentication endpoints
├── index.js                   # Application entry point
├── server.js                  # Server configuration
└── package.json               # Dependencies and scripts
```

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas cloud instance)
- npm or yarn

## Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

## Configuration

Create a `.env` file in the backend directory with the following variables:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/airlux
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d
NODE_ENV=development
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT token generation
- `JWT_EXPIRE` - JWT token expiration time
- `NODE_ENV` - Environment mode (development/production)

## Running the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your .env file).

## API Endpoints

### Authentication

The backend includes authentication endpoints for user management:

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user and receive JWT token
- `GET /api/auth/profile` - Get user profile (protected)

### Base Endpoint

- `GET /` - Health check endpoint

## Development

### Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (to be implemented)

### Adding New Routes

1. Create a new route file in `src/routes/`
2. Create corresponding controller in `src/controllers/`
3. Import and use the route in your main server file

### Database Models

Models are defined using Mongoose schemas in the `src/models/` directory. The User model includes:
- Email validation
- Password hashing with bcryptjs
- JWT token generation

## Security Features

- Password hashing with bcryptjs
- JWT-based authentication
- Input validation with express-validator
- CORS configuration
- Environment variable protection

## Error Handling

The API returns consistent error responses in JSON format:

```json
{
  "success": false,
  "message": "Error message here"
}
```

## License

ISC

## Author

AirLux Development Team
