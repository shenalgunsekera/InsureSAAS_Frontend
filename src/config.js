// Configuration for API endpoints
const config = {
  development: {
    API_URL: 'http://localhost:5000'
  },
  production: {
    API_URL: process.env.REACT_APP_API_URL || ''
  }
};

// Get the current environment
const environment = process.env.NODE_ENV || 'development';

// Export the appropriate configuration
export const API_URL = config[environment].API_URL;

export default config[environment]; 