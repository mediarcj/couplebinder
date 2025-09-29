Detechify
Building detechify.com

A web application project with Node.js backend, PostgreSQL database, and Redis session management.

## Features

- User authentication and session management
- Text submission and validation
- Transactional database operations
- Redis session storage
- Docker containerization
- Health check endpoints
- Graceful server shutdown
- CSRF protection
- Server-authoritative security

## Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Git

### Installation
```bash
# Clone repository
git clone https://github.com/mediarcj/detechify.git
cd detechify

# Start services
docker-compose up --build
```

### Access
- Application: http://localhost:3000
- Health Check: http://localhost:3000/health
- API Endpoints: http://localhost:3000/api/*

## Migration to Supabase

Detechify is designed for easy migration to Supabase. The application uses:
- Repository pattern for database access
- Transactional write/read patterns
- Portable schema design with UUIDs and timezone-aware timestamps
- Standard SQL with safe defaults

### Migration Documentation
- [Supabase Migration Guide](docs/supabase-migration-guide.md)
- [Connection String Migration](docs/connection-string-migration.md)

### Automated Migration
```bash
# Dry run (recommended first)
node scripts/migrate-to-supabase.js --dry-run

# Full migration
node scripts/migrate-to-supabase.js --migrate

# Rollback if needed
node scripts/migrate-to-supabase.js --rollback
```

## Project Structure

```
detechify/
├── package.json (private workspace root)
├── package-lock.json (single lockfile)
├── README.md
├── docs/
│   ├── supabase-migration-guide.md
│   └── connection-string-migration.md
├── scripts/
│   └── migrate-to-supabase.js
├── server/
│   ├── package.json (server dependencies)
│   ├── zorvalon.js (main server file)
│   ├── config/
│   ├── db/
│   │   ├── connection.js
│   │   ├── knexClient.js
│   │   └── repo/
│   ├── routes/
│   ├── middleware/
│   ├── knex/
│   │   └── migrations/
│   └── public/
└── .gitignore
```

## Development

### Environment Setup
```bash
# Copy environment template
cp server/env.example server/.env

# Update with your configuration
# Edit server/.env
```

### Database Migrations
```bash
# Run migrations
docker-compose exec detechify-server npx knex migrate:latest

# Check migration status
docker-compose exec detechify-server npx knex migrate:status
```

### Testing
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test user creation
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass","first_name":"John","last_name":"Doe"}'

# Test database submission
curl -X POST http://localhost:3000/api/submit/db \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test submission"}'
```

## Production Deployment

### Environment Variables
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database
REDIS_HOST=redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

### Docker Deployment
```bash
# Production build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check logs
docker-compose logs -f detechify-server
```

## API Endpoints

### Health Check
- `GET /health` - Application health status
- `GET /health/liveness` - Liveness probe
- `GET /health/readiness` - Readiness probe

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/status` - Authentication status

### Users
- `POST /api/users` - Create user (transactional)
- `GET /api/users/:id` - Get user by ID

### Submissions
- `POST /api/submit` - Submit text (in-memory)
- `POST /api/submit/db` - Submit text (database, transactional)
- `GET /api/submissions` - Get recent submissions

## Security Features

- CSRF protection on state-changing requests
- Server-side input validation and sanitization
- Rate limiting (handled at Cloudflare edge)
- Session management with Redis
- Password hashing with bcrypt
- SQL injection prevention
- XSS protection
- Secure cookie configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License - see LICENSE file for details