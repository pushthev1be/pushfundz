/**
 * 🧪 PushFundz User Flow Test Suite
 * Extracted from comprehensive test user flow attachment
 * 
 * This script tests the complete user journey from registration to loan completion
 */

const axios = require('axios');
const fs = require('fs');

const API_BASE_URL = process.env.API_URL || 'http://localhost:8000';
const GAMES_SERVICE_URL = process.env.GAMES_SERVICE_URL || 'http://localhost:3006';

const generateRandomWallet = () => {
  const chars = '0123456789abcdef';
  let result = '0x';
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const testUser = {
  name: 'Test User',
  email: `testuser${Date.now()}@example.com`,
  wallet_address: generateRandomWallet()
};

const testReferralCode = 'TEST123';

class PushFundzUserFlowTest {
  constructor() {
    this.testResults = [];
    this.userId = null;
    this.membershipStatus = null;
    this.loanId = null;
  }

  async log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    this.testResults.push({ timestamp, type, message });
  }

  async testHealthCheck() {
    try {
      await this.log('Testing health check...');
      const response = await axios.get(`${API_BASE_URL}/healthz`);
      if (response.data.status === 'ok') {
        await this.log('✅ Health check passed', 'SUCCESS');
        return true;
      } else {
        await this.log('❌ Health check failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Health check failed: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async testUserRegistration() {
    try {
      await this.log('Testing user registration...');
      const response = await axios.post(`${API_BASE_URL}/api/users/register`, {
        name: testUser.name,
        email: testUser.email,
        wallet_address: testUser.wallet_address
      });

      if (response.data.user_id) {
        this.userId = response.data.user_id;
        await this.log(`✅ User registration successful. User ID: ${this.userId}`, 'SUCCESS');
        return true;
      } else {
        await this.log('❌ User registration failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ User registration failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testUserLogin() {
    try {
      await this.log('Testing user login...');
      const response = await axios.post(`${API_BASE_URL}/api/users/login`, {
        email: testUser.email
      });

      if (response.data.user) {
        if (!this.userId && response.data.user.id) {
          this.userId = response.data.user.id;
        }
        await this.log(`✅ User login successful`, 'SUCCESS');
        return true;
      } else {
        await this.log('❌ User login failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ User login failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testDailyRPClaim() {
    try {
      if (!this.userId) {
        await this.log('❌ Daily RP claim skipped: No valid user ID', 'ERROR');
        return false;
      }
      
      await this.log('Testing daily RP claim...');
      const response = await axios.post(`${API_BASE_URL}/api/games/daily-drip`, {
        user_id: this.userId
      });

      if (response.data.rpAwarded) {
        await this.log(`✅ Daily RP claimed successfully. RP awarded: ${response.data.rpAwarded}`, 'SUCCESS');
        return true;
      } else {
        await this.log('❌ Daily RP claim failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Daily RP claim failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testRockPaperScissors() {
    try {
      if (!this.userId) {
        await this.log('❌ RPS game skipped: No valid user ID', 'ERROR');
        return false;
      }
      
      await this.log('Testing Rock Paper Scissors game...');
      const response = await axios.post(`${API_BASE_URL}/api/games/rps`, {
        user_id: this.userId,
        choice: 'rock'
      });

      if (response.data.result) {
        await this.log(`✅ RPS game completed. Result: ${response.data.result}`, 'SUCCESS');
        await this.log(`RP won: ${response.data.rp_won}, New balance: ${response.data.new_rp_balance}`, 'INFO');
        return true;
      } else {
        await this.log('❌ RPS game failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ RPS game failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testSpinWheel() {
    try {
      if (!this.userId) {
        await this.log('❌ Spin wheel skipped: No valid user ID', 'ERROR');
        return false;
      }
      
      await this.log('Testing Spin Wheel game...');
      const response = await axios.post(`${API_BASE_URL}/api/games/spin`, {
        user_id: this.userId,
        rp_stake: 50
      });

      if (response.data.result) {
        await this.log(`✅ Spin wheel completed. Result: ${response.data.result}`, 'SUCCESS');
        await this.log(`RP won: ${response.data.rp_won}, New balance: ${response.data.new_rp_balance}`, 'INFO');
        return true;
      } else {
        await this.log('❌ Spin wheel failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Spin wheel failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testWhotGame() {
    try {
      if (!this.userId) {
        await this.log('❌ Whot game skipped: No valid user ID', 'ERROR');
        return false;
      }
      
      await this.log('Testing Whot game...');
      const response = await axios.post(`${API_BASE_URL}/api/games/whot`, {
        user_id: this.userId
      });

      if (response.data.result) {
        await this.log(`✅ Whot game completed. Result: ${response.data.result}`, 'SUCCESS');
        await this.log(`RP won: ${response.data.rp_won}, New balance: ${response.data.new_rp_balance}`, 'INFO');
        await this.log(`Message: ${response.data.message}`, 'INFO');
        return true;
      } else {
        await this.log('❌ Whot game failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Whot game failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testLoanRequest() {
    try {
      if (!this.userId) {
        await this.log('❌ Loan request skipped: No valid user ID', 'ERROR');
        return false;
      }
      
      await this.log('Testing loan request...');
      const response = await axios.post(`${API_BASE_URL}/api/loans/request`, {
        amount_usd: 100,
        duration_days: 30,
        collateral_crypto: 'BTC',
        collateral_amount: 0.001,
        purpose: 'Personal loan'
      }, {
        params: { user_id: this.userId }
      });

      if (response.data.loan_id) {
        this.loanId = response.data.loan_id;
        await this.log(`✅ Loan request successful. Loan ID: ${this.loanId}`, 'SUCCESS');
        return true;
      } else {
        await this.log('❌ Loan request failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Loan request failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testUserProfile() {
    try {
      if (!this.userId) {
        await this.log('❌ User profile skipped: No valid user ID', 'ERROR');
        return false;
      }
      
      await this.log('Testing user profile retrieval...');
      const response = await axios.get(`${API_BASE_URL}/api/users/${this.userId}`);

      if (response.data.user) {
        await this.log(`✅ User profile retrieved successfully`, 'SUCCESS');
        await this.log(`Name: ${response.data.user.name}`, 'INFO');
        await this.log(`Email: ${response.data.user.email}`, 'INFO');
        await this.log(`Credit score: ${response.data.user.credit_score}`, 'INFO');
        return true;
      } else {
        await this.log('❌ User profile retrieval failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ User profile retrieval failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async testPlatformStats() {
    try {
      await this.log('Testing platform statistics...');
      const response = await axios.get(`${API_BASE_URL}/api/stats`);

      if (response.data.total_users !== undefined) {
        await this.log(`✅ Platform stats retrieved successfully`, 'SUCCESS');
        await this.log(`Total users: ${response.data.total_users}`, 'INFO');
        await this.log(`Total loans: ${response.data.total_loans}`, 'INFO');
        return true;
      } else {
        await this.log('❌ Platform stats retrieval failed', 'ERROR');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Platform stats retrieval failed: ${error.response?.data?.detail || error.message}`, 'ERROR');
      return false;
    }
  }

  async runAllTests() {
    await this.log('🚀 Starting PushFundz User Flow Test Suite', 'HEADER');
    await this.log('==========================================', 'HEADER');

    const tests = [
      { name: 'Health Check', method: this.testHealthCheck.bind(this) },
      { name: 'User Registration', method: this.testUserRegistration.bind(this) },
      { name: 'User Login', method: this.testUserLogin.bind(this) },
      { name: 'Daily RP Claim', method: this.testDailyRPClaim.bind(this) },
      { name: 'Rock Paper Scissors Game', method: this.testRockPaperScissors.bind(this) },
      { name: 'Spin Wheel Game', method: this.testSpinWheel.bind(this) },
      { name: 'Whot Game', method: this.testWhotGame.bind(this) },
      { name: 'Loan Request', method: this.testLoanRequest.bind(this) },
      { name: 'User Profile', method: this.testUserProfile.bind(this) },
      { name: 'Platform Statistics', method: this.testPlatformStats.bind(this) }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const test of tests) {
      await this.log(`\n📋 Running: ${test.name}`, 'TEST');
      try {
        const result = await test.method();
        if (result) {
          passedTests++;
        }
      } catch (error) {
        await this.log(`❌ Test ${test.name} threw an exception: ${error.message}`, 'ERROR');
      }
    }

    await this.log('\n📊 Test Summary', 'HEADER');
    await this.log('================', 'HEADER');
    await this.log(`✅ Passed: ${passedTests}/${totalTests}`, 'SUMMARY');
    await this.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`, 'SUMMARY');
    await this.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`, 'SUMMARY');

    if (passedTests === totalTests) {
      await this.log('\n🎉 All tests passed! User flow is working correctly.', 'SUCCESS');
    } else {
      await this.log('\n⚠️  Some tests failed. Please check the logs above.', 'WARNING');
    }

    const testReport = {
      timestamp: new Date().toISOString(),
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      successRate: ((passedTests / totalTests) * 100).toFixed(1),
      results: this.testResults
    };

    fs.writeFileSync('test-results.json', JSON.stringify(testReport, null, 2));
    await this.log('\n📄 Test results saved to test-results.json', 'INFO');
  }
}

async function main() {
  const tester = new PushFundzUserFlowTest();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PushFundzUserFlowTest;
