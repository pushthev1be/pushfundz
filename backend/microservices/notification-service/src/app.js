const express = require('express');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const webpush = require('web-push');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

const emailTransporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const twilioClient = process.env.TWILIO_ACCOUNT_SID ? 
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + process.env.EMAIL_USER,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

let messageChannel = null;
const QUEUE_NAME = 'notifications';

async function connectToQueue() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    messageChannel = await connection.createChannel();
    await messageChannel.assertQueue(QUEUE_NAME, { durable: true });
    
    messageChannel.consume(QUEUE_NAME, async (msg) => {
      if (msg) {
        try {
          const notification = JSON.parse(msg.content.toString());
          await processNotification(notification);
          messageChannel.ack(msg);
        } catch (error) {
          console.error('Queue message processing error:', error);
          messageChannel.nack(msg, false, false); // Don't requeue
        }
      }
    });
    
    console.log('Connected to message queue');
  } catch (error) {
    console.error('Queue connection failed:', error);
  }
}

connectToQueue();

const TEMPLATES = {
  LOAN_APPROVED: {
    email: {
      subject: 'Loan Approved - PushFundz',
      html: `
        <h2>Your loan has been approved!</h2>
        <p>Loan Amount: ${{amount}}</p>
        <p>Interest Rate: {{interestRate}}%</p>
        <p>Due Date: {{dueDate}}</p>
        <p>The funds will be disbursed to your wallet shortly.</p>
      `
    },
    sms: 'Your PushFundz loan of ${{amount}} has been approved! Funds will be disbursed shortly.',
    push: {
      title: 'Loan Approved',
      body: 'Your loan of ${{amount}} has been approved and will be disbursed shortly.',
      icon: '/icons/loan-approved.png'
    }
  },
  LOAN_DISBURSED: {
    email: {
      subject: 'Loan Disbursed - PushFundz',
      html: `
        <h2>Your loan has been disbursed!</h2>
        <p>Amount: ${{amount}} {{currency}}</p>
        <p>Transaction Hash: {{txHash}}</p>
        <p>Due Date: {{dueDate}}</p>
        <p>You can view the transaction on the blockchain explorer.</p>
      `
    },
    sms: 'Your PushFundz loan of ${{amount}} {{currency}} has been disbursed. Due: {{dueDate}}',
    push: {
      title: 'Loan Disbursed',
      body: '${{amount}} {{currency}} has been sent to your wallet.',
      icon: '/icons/loan-disbursed.png'
    }
  },
  REPAYMENT_REMINDER: {
    email: {
      subject: 'Loan Repayment Reminder - PushFundz',
      html: `
        <h2>Loan Repayment Reminder</h2>
        <p>Your loan repayment of ${{amount}} is due in {{daysUntilDue}} days.</p>
        <p>Due Date: {{dueDate}}</p>
        <p>Please ensure you have sufficient funds in your wallet.</p>
        <a href="{{repaymentUrl}}">Repay Now</a>
      `
    },
    sms: 'PushFundz reminder: Loan repayment of ${{amount}} due in {{daysUntilDue}} days. Due: {{dueDate}}',
    push: {
      title: 'Repayment Reminder',
      body: 'Loan repayment of ${{amount}} due in {{daysUntilDue}} days.',
      icon: '/icons/repayment-reminder.png'
    }
  },
  REPAYMENT_OVERDUE: {
    email: {
      subject: 'Overdue Loan Payment - PushFundz',
      html: `
        <h2>Overdue Loan Payment</h2>
        <p>Your loan repayment of ${{amount}} is now overdue.</p>
        <p>Due Date: {{dueDate}}</p>
        <p>Please repay immediately to avoid additional fees and protect your credit score.</p>
        <a href="{{repaymentUrl}}">Repay Now</a>
      `
    },
    sms: 'URGENT: Your PushFundz loan repayment of ${{amount}} is overdue. Please repay immediately.',
    push: {
      title: 'Payment Overdue',
      body: 'Your loan repayment of ${{amount}} is overdue. Please repay immediately.',
      icon: '/icons/overdue.png'
    }
  },
  POINTS_EARNED: {
    email: {
      subject: 'Points Earned - PushFundz',
      html: `
        <h2>You earned {{points}} points!</h2>
        <p>Reason: {{reason}}</p>
        <p>Total Points: {{totalPoints}}</p>
        <p>Current Tier: {{tier}}</p>
        <p>Keep earning points to unlock better loan terms and exclusive benefits!</p>
      `
    },
    push: {
      title: 'Points Earned!',
      body: 'You earned {{points}} points for {{reason}}. Total: {{totalPoints}}',
      icon: '/icons/points-earned.png'
    }
  },
  TIER_UPGRADED: {
    email: {
      subject: 'Tier Upgrade - PushFundz',
      html: `
        <h2>Congratulations! You've been upgraded to {{newTier}} tier!</h2>
        <p>Your new benefits include:</p>
        <ul>
          <li>Lower interest rates</li>
          <li>Higher loan limits</li>
          <li>Priority support</li>
          <li>Exclusive features</li>
        </ul>
        <p>Total Points: {{totalPoints}}</p>
      `
    },
    push: {
      title: 'Tier Upgrade!',
      body: 'Congratulations! You\'ve been upgraded to {{newTier}} tier!',
      icon: '/icons/tier-upgrade.png'
    }
  }
};

app.post('/send', async (req, res) => {
  try {
    const notification = req.body;
    await processNotification(notification);
    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Notification send error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.post('/queue', async (req, res) => {
  try {
    const notification = req.body;
    
    if (messageChannel) {
      messageChannel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(notification)), {
        persistent: true
      });
      res.json({ success: true, message: 'Notification queued' });
    } else {
      await processNotification(notification);
      res.json({ success: true, message: 'Notification sent directly' });
    }
  } catch (error) {
    console.error('Notification queue error:', error);
    res.status(500).json({ error: 'Failed to queue notification' });
  }
});

async function processNotification(notification) {
  const { type, userId, email, phone, pushSubscription, data = {} } = notification;
  
  const template = TEMPLATES[type];
  if (!template) {
    throw new Error(`Unknown notification type: ${type}`);
  }
  
  const promises = [];
  
  if (email && template.email) {
    promises.push(sendEmail(email, template.email, data));
  }
  
  if (phone && template.sms) {
    promises.push(sendSMS(phone, template.sms, data));
  }
  
  if (pushSubscription && template.push) {
    promises.push(sendPushNotification(pushSubscription, template.push, data));
  }
  
  await Promise.allSettled(promises);
}

async function sendEmail(email, template, data) {
  try {
    const subject = replaceTemplateVars(template.subject, data);
    const html = replaceTemplateVars(template.html, data);
    
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html
    });
    
    console.log(`Email sent to ${email}`);
  } catch (error) {
    console.error('Email send error:', error);
  }
}

async function sendSMS(phone, template, data) {
  try {
    if (!twilioClient) {
      console.log('SMS not configured, skipping');
      return;
    }
    
    const message = replaceTemplateVars(template, data);
    
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    
    console.log(`SMS sent to ${phone}`);
  } catch (error) {
    console.error('SMS send error:', error);
  }
}

async function sendPushNotification(subscription, template, data) {
  try {
    const payload = {
      title: replaceTemplateVars(template.title, data),
      body: replaceTemplateVars(template.body, data),
      icon: template.icon,
      badge: '/icons/badge.png',
      data: data
    };
    
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    
    console.log('Push notification sent');
  } catch (error) {
    console.error('Push notification error:', error);
  }
}

function replaceTemplateVars(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match;
  });
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'notification-service',
    queueConnected: !!messageChannel,
    availableTemplates: Object.keys(TEMPLATES)
  });
});

app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});

module.exports = app;
