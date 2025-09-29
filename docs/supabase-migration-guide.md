# Supabase Migration Guide

## Overview

This guide provides a complete step-by-step process for migrating Detechify from PostgreSQL + Knex to Supabase while maintaining all existing functionality and data integrity.

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose available
- Supabase account and project created
- Current Detechify application running successfully

## Migration Strategy

### Phase 1: Pre-Migration Setup
1. **Create Supabase Project**
   - Sign up at [supabase.com](https://supabase.com)
   - Create new project
   - Note down project URL and anon key
   - Enable Row Level Security (RLS) if needed

2. **Backup Current Database**
   ```bash
   # Create database backup
   docker-compose exec postgres pg_dump -U postgres paicon > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

3. **Verify Current Schema**
   ```bash
   # Check current migrations
   docker-compose exec detechify-server npx knex migrate:status
   ```

### Phase 2: Schema Migration

1. **Export Current Schema**
   ```bash
   # Export schema to SQL file
   docker-compose exec postgres pg_dump -U postgres -s paicon > schema_export.sql
   ```

2. **Apply Schema to Supabase**
   - Copy schema_export.sql content
   - Run in Supabase SQL Editor
   - Verify all tables and extensions are created

3. **Enable Required Extensions**
   ```sql
   -- Enable pgcrypto for UUID generation
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```

### Phase 3: Data Migration

1. **Export Data**
   ```bash
   # Export data only (no schema)
   docker-compose exec postgres pg_dump -U postgres -a paicon > data_export.sql
   ```

2. **Import Data to Supabase**
   - Run data_export.sql in Supabase SQL Editor
   - Verify data integrity and row counts

### Phase 4: Connection String Update

1. **Update Environment Variables**
   ```bash
   # Update .env file with Supabase connection string
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```

2. **Test Connection**
   ```bash
   # Test new connection
   docker-compose exec detechify-server npx knex migrate:status
   ```

### Phase 5: Application Updates

1. **Update Configuration**
   - Modify `server/config/index.js` for Supabase-specific settings
   - Update connection pooling parameters
   - Adjust timeout settings for cloud database

2. **Verify Repository Functions**
   - Test all repository functions work with Supabase
   - Verify transaction patterns function correctly
   - Check UUID generation and timestamp handling

### Phase 6: Testing and Validation

1. **Functional Testing**
   ```bash
   # Test all endpoints
   curl http://localhost:3000/health
   curl http://localhost:3000/api/users
   curl http://localhost:3000/api/submit/db
   ```

2. **Transaction Testing**
   - Test user creation with validation
   - Test duplicate email handling
   - Test database submission transactions
   - Verify rollback scenarios

3. **Performance Testing**
   - Monitor connection times
   - Check query performance
   - Verify connection pooling

## Rollback Procedure

If migration issues occur:

1. **Restore Database Backup**
   ```bash
   # Restore from backup
   docker-compose exec postgres psql -U postgres paicon < backup_YYYYMMDD_HHMMSS.sql
   ```

2. **Revert Environment Variables**
   ```bash
   # Restore original DATABASE_URL
   DATABASE_URL=postgresql://postgres:password@postgres:5432/paicon
   ```

3. **Restart Application**
   ```bash
   docker-compose restart detechify-server
   ```

## Post-Migration Checklist

- [ ] All endpoints responding correctly
- [ ] User authentication working
- [ ] Database transactions functioning
- [ ] UUID generation working
- [ ] Timestamps displaying correctly
- [ ] Repository functions operational
- [ ] Error handling working
- [ ] Performance acceptable
- [ ] Monitoring and logging active

## Troubleshooting

### Common Issues

1. **Connection Timeout**
   - Increase connection timeout in config
   - Check Supabase project status
   - Verify network connectivity

2. **UUID Generation Errors**
   - Ensure pgcrypto extension is enabled
   - Check gen_random_uuid() function availability

3. **Transaction Issues**
   - Verify transaction isolation levels
   - Check for connection pooling conflicts

4. **Performance Issues**
   - Monitor connection pool usage
   - Check query execution plans
   - Consider connection pool tuning

### Support Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Migration Guide](https://supabase.com/docs/guides/database/migrations)
- [Connection Pooling Best Practices](https://supabase.com/docs/guides/database/connecting-to-postgres)

## Migration Script Usage

Use the automated migration script for safer migration:

```bash
# Dry run (recommended first)
node scripts/migrate-to-supabase.js --dry-run

# Full migration
node scripts/migrate-to-supabase.js --migrate

# Rollback if needed
node scripts/migrate-to-supabase.js --rollback
```

## Security Considerations

1. **Connection Security**
   - Use SSL connections to Supabase
   - Rotate database passwords regularly
   - Monitor connection logs

2. **Data Privacy**
   - Verify RLS policies if enabled
   - Check data encryption in transit
   - Audit access patterns

3. **Backup Strategy**
   - Set up automated Supabase backups
   - Test backup restoration procedures
   - Document disaster recovery plans

## Performance Optimization

1. **Connection Pooling**
   - Configure appropriate pool size
   - Monitor connection usage
   - Set proper timeout values

2. **Query Optimization**
   - Add database indexes as needed
   - Monitor slow queries
   - Use connection pooling effectively

3. **Monitoring**
   - Set up Supabase monitoring
   - Monitor application performance
   - Track database metrics

This migration guide ensures a smooth transition to Supabase while maintaining all existing functionality and data integrity.
