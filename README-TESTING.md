# PushFundz Comprehensive Testing Guide

This document provides detailed instructions for running the comprehensive user flow test suite for the PushFundz crypto lending platform.

## Overview

The test suite validates the complete user journey from registration through loan processing, including:

- ✅ Health checks for all services
- ✅ User registration and login
- ✅ Daily RP claiming system
- ✅ Gaming features (Rock Paper Scissors, Spin Wheel, Whot)
- ✅ Loan request processing
- ✅ User profile management
- ✅ Platform statistics

## Prerequisites

1. **Node.js** (v18+ recommended)
2. **Python 3.12** with Poetry
3. **SQLite** (for local database)
4. **All service dependencies installed**

## Quick Start

### 1. Install Dependencies

```bash
# Install test dependencies
npm install

# Install all service dependencies
npm run install:all
```

### 2. Start Services

Start services in separate terminals:

```bash
# Terminal 1: Backend API
npm run start:backend

# Terminal 2: Games Service
npm run start:games

# Terminal 3: Frontend (optional, for UI testing)
npm run start:frontend
```

### 3. Run Tests

```bash
# Run comprehensive test suite
npm run test:dev
```

## Test Configuration

### Environment Variables

- `API_URL`: Backend API URL (default: http://localhost:8000)
- `GAMES_SERVICE_URL`: Games service URL (default: http://localhost:3006)

### Test Data

The test suite uses dynamically generated test data:
- Email: `testuser{timestamp}@example.com`
- Wallet: `0x1234567890123456789012345678901234567890`
- Name: `Test User`

## Test Results

After running tests, check:

1. **Console Output**: Real-time test progress and results
2. **test-results.json**: Detailed test report with timestamps and results
3. **Database**: Verify data persistence in `crypto-lending-backend/pushfundz.db`

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure backend service is running on port 8000
   - Check database file exists and is accessible

2. **Games Service Unavailable**
   - Verify games service is running on port 3006
   - Check SQLite database permissions

3. **Test Failures**
   - Review test-results.json for detailed error messages
   - Check service logs for backend errors
   - Verify database schema is up to date

### Service Health Checks

```bash
# Check backend health
curl http://localhost:8000/healthz

# Check games service health
curl http://localhost:3006/health
```

## Test Coverage

The comprehensive test suite covers:

### Core User Flow
1. **Registration**: Email validation, wallet address validation
2. **Authentication**: Login with email or wallet address
3. **Profile Management**: User data retrieval and updates

### Gaming System
1. **Daily RP Claim**: Once-per-day reward system
2. **Rock Paper Scissors**: Player vs CPU with RP stakes
3. **Spin Wheel**: Variable stake gambling with probability-based rewards
4. **Whot Card Game**: Strategic card game against AI

### Lending Platform
1. **Loan Requests**: Collateral-based loan applications
2. **Credit Scoring**: Dynamic credit score calculation
3. **Interest Rates**: Tier-based interest rate determination
4. **Repayment**: Loan repayment processing

### Platform Analytics
1. **User Statistics**: Total users, active users
2. **Loan Metrics**: Total loans, default rates
3. **Gaming Analytics**: RP distribution, game popularity

## Security Considerations

The test suite validates:
- Input sanitization and validation
- Authentication and authorization
- Rate limiting (where implemented)
- Error handling and information disclosure

## Performance Testing

Monitor during test execution:
- Response times for each endpoint
- Database query performance
- Memory usage of services
- Concurrent user handling

## Continuous Integration

For CI/CD integration:

```bash
# Run tests with JSON output
npm run test:dev > test-output.log 2>&1

# Check exit code
echo $?
```

## Contributing

When adding new tests:

1. Follow existing test patterns
2. Add proper error handling
3. Include descriptive logging
4. Update this documentation
5. Verify tests pass in clean environment

## Support

For issues with the test suite:
1. Check service logs
2. Verify database state
3. Review test-results.json
4. Check network connectivity
5. Validate service configurations

---

**Note**: This test suite is designed for development and staging environments. For production testing, use appropriate test data and ensure proper data cleanup.
