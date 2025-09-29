# Connection String Migration Guide

## Overview

This guide explains how to transition Detechify from local PostgreSQL to Supabase by updating connection strings and configuration.

## Current Configuration

### Local PostgreSQL Setup
```bash
# Current .env configuration
DATABASE_URL=postgresql://postgres:password@postgres:5432/paicon
DB_HOST=postgres
DB_PORT=5432
DB_NAME=paicon
DB_USER=postgres
DB_PASSWORD=password
```

### Docker Compose Configuration
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: paicon
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
```

## Supabase Configuration

### Supabase Project Setup
1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note project URL and database password

2. **Get Connection Details**
   - Project URL: `https://[project-ref].supabase.co`
   - Database URL: `postgresql://postgres:[password]@[project-ref].supabase.co:5432/postgres`
   - API URL: `https://[project-ref].supabase.co`
   - Anon Key: Available in project settings

### Updated .env Configuration
```bash
# Supabase .env configuration
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres
DB_HOST=[YOUR-PROJECT-REF].supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=[YOUR-PASSWORD]

# Supabase specific settings
SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR-SERVICE-ROLE-KEY]
```

## Migration Steps

### Step 1: Update Environment Variables
```bash
# Update .env file with Supabase credentials
cp .env .env.backup
# Edit .env with new Supabase connection string
```

### Step 2: Test Connection
```bash
# Test database connection
docker-compose exec detechify-server npx knex migrate:status

# Test application endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/users
```

### Step 3: Verify Schema Compatibility
```bash
# Check if all tables exist
docker-compose exec detechify-server npx knex migrate:status

# Verify extensions are enabled
docker-compose exec detechify-server npx knex raw "SELECT * FROM pg_extension WHERE extname = 'pgcrypto';"
```

### Step 4: Update Docker Compose (Optional)
If you want to remove local PostgreSQL:

```yaml
# docker-compose.yml (updated)
services:
  detechify-server:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=${NODE_ENV}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PORT=${REDIS_PORT}
      - REDIS_PASSWORD=${REDIS_PASSWORD}
    depends_on:
      - redis
    # Remove postgres dependency

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

volumes:
  redis_data:
  # Remove postgres_data volume
```

## Configuration Updates

### Server Configuration
Update `server/config/index.js` for Supabase-specific settings:

```javascript
// Supabase configuration
const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Connection pooling settings for cloud database
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100
  }
};
```

### Knex Configuration
Update `server/knexfile.js` for Supabase:

```javascript
// knexfile.js
module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100
    },
    migrations: {
      directory: './knex/migrations'
    },
    seeds: {
      directory: './knex/seeds'
    }
  },
  
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 60000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 60000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100
    },
    migrations: {
      directory: './knex/migrations'
    },
    seeds: {
      directory: './knex/seeds'
    }
  }
};
```

## Connection String Formats

### PostgreSQL Connection String Format
```
postgresql://[user]:[password]@[host]:[port]/[database]
```

### Examples
```bash
# Local PostgreSQL
postgresql://postgres:password@localhost:5432/paicon

# Supabase
postgresql://postgres:your-password@your-project-ref.supabase.co:5432/postgres

# With SSL (recommended for production)
postgresql://postgres:your-password@your-project-ref.supabase.co:5432/postgres?sslmode=require
```

## SSL Configuration

### Enable SSL for Production
```bash
# Add SSL parameters to connection string
DATABASE_URL=postgresql://postgres:password@project-ref.supabase.co:5432/postgres?sslmode=require&sslcert=client-cert.pem&sslkey=client-key.pem&sslrootcert=ca-cert.pem
```

### SSL Configuration in Knex
```javascript
// knexfile.js
module.exports = {
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    }
  }
};
```

## Connection Pooling

### Supabase Connection Limits
- **Free Tier**: 60 connections max
- **Pro Tier**: 200 connections max
- **Team Tier**: 500 connections max

### Recommended Pool Settings
```javascript
// For Supabase
const poolConfig = {
  min: 2,                    // Minimum connections
  max: 10,                   // Maximum connections (adjust based on tier)
  acquireTimeoutMillis: 30000,  // Wait time for connection
  createTimeoutMillis: 30000,   // Connection creation timeout
  destroyTimeoutMillis: 5000,   // Connection cleanup timeout
  idleTimeoutMillis: 30000,     // Idle connection timeout
  reapIntervalMillis: 1000,     // Cleanup interval
  createRetryIntervalMillis: 100 // Retry interval
};
```

## Troubleshooting

### Common Connection Issues

1. **Connection Timeout**
   ```bash
   # Increase timeout settings
   export DB_TIMEOUT=60000
   ```

2. **SSL Certificate Issues**
   ```bash
   # Add SSL configuration
   export DB_SSL_MODE=require
   ```

3. **Connection Pool Exhaustion**
   ```bash
   # Reduce pool size
   export DB_POOL_MAX=5
   ```

### Connection Testing
```bash
# Test connection with psql
psql "postgresql://postgres:password@project-ref.supabase.co:5432/postgres"

# Test with Node.js
node -e "
const knex = require('knex');
const config = require('./server/knexfile');
const db = knex(config.development);
db.raw('SELECT 1').then(() => {
  console.log('Connection successful');
  process.exit(0);
}).catch(err => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
"
```

## Security Considerations

### Environment Variables
- Never commit `.env` files to version control
- Use different credentials for development and production
- Rotate database passwords regularly

### Connection Security
- Use SSL connections in production
- Implement connection pooling
- Monitor connection usage
- Set up connection logging

### Access Control
- Use least privilege principle
- Implement Row Level Security (RLS) in Supabase
- Monitor database access patterns
- Set up audit logging

## Performance Optimization

### Connection Pooling
- Configure appropriate pool size
- Monitor connection usage
- Set proper timeout values
- Use connection pooling effectively

### Query Optimization
- Add database indexes as needed
- Monitor slow queries
- Use prepared statements
- Optimize connection usage

### Monitoring
- Set up Supabase monitoring
- Monitor application performance
- Track database metrics
- Set up alerting for connection issues

This guide ensures a smooth transition from local PostgreSQL to Supabase while maintaining security and performance.
