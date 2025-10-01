// File: server/knexfile.js
// Description: Knex.js database configuration for Detechify
// Purpose: Defines database connection settings for development, production, and migrations
// Notes: Uses environment variables for database credentials and connection pooling

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Determine connection string - prioritize Supabase
const getConnection = () => {
  if (process.env.SUPABASE_DB_URL) {
    return process.env.SUPABASE_DB_URL;
  }
  
  // Fallback to individual variables only if all are present
  if (process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
    return {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    };
  }
  
  throw new Error('No valid database connection configuration found. Set SUPABASE_DB_URL or all DB_* variables.');
};

module.exports = {
  development: {
    client: 'postgresql',
    connection: getConnection(),
    migrations: {
      directory: './knex/migrations'
    },
    seeds: {
      directory: './knex/seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  production: {
    client: 'postgresql',
    connection: getConnection(),
    migrations: {
      directory: './knex/migrations'
    },
    seeds: {
      directory: './knex/seeds'
    },
    pool: {
      min: 2,
      max: 20
    }
  }
};
