const path = require('path');
const dotenv = require('dotenv');

const app = require('./app');
const { connectDb } = require('./config');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDb();
    console.log('MongoDB connected');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
