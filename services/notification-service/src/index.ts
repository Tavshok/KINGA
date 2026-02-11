/**
 * KINGA Notification Service
 * 
 * Standalone microservice that consumes events from Kafka and sends notifications
 * via email, SMS, and push notifications.
 * 
 * @author Tavonga Shoko
 * @version 1.0.0
 */

import { config } from 'dotenv';
import express from 'express';
import { register } from 'prom-client';
import { createEventSubscriber, initializeKafkaClient, setupGracefulShutdown } from '@kinga/events';
import { sendEmail } from './email';
import { logger } from './logger';

// Load environment variables
config();

const PORT = process.env.PORT || 3001;
const SERVICE_NAME = 'notification-service';

/**
 * Initialize Express server for health checks and metrics
 */
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: SERVICE_NAME });
});

app.get('/ready', (req, res) => {
  res.json({ status: 'ready', service: SERVICE_NAME });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

/**
 * Main application logic
 */
async function main() {
  logger.info(`Starting ${SERVICE_NAME}...`);

  // Initialize Kafka client
  initializeKafkaClient();

  // Create event subscriber
  const subscriber = createEventSubscriber({
    serviceName: SERVICE_NAME,
    maxRetries: 3,
    initialRetryDelay: 1000,
    backoffMultiplier: 2,
  });

  // Initialize subscriber with topics
  await subscriber.initialize({
    topics: [
      'claim-intake.claim.submitted',
      'claim-intake.claim.status-changed',
      'ai-damage.assessment.completed',
      'fraud-detection.alert.raised',
      'cost-optimisation.quote.received',
      'workflow-engine.approval.requested',
    ],
    groupId: `${SERVICE_NAME}-group`,
    fromBeginning: false,
  });

  // Register event handlers
  
  /**
   * Handle ClaimSubmitted event
   */
  subscriber.on('ClaimSubmitted', async (event) => {
    logger.info(`Processing ClaimSubmitted event: ${event.eventId}`);
    
    try {
      // Send email to claimant
      await sendEmail({
        to: `claimant-${event.payload.claimantId}@example.com`, // TODO: Fetch actual email from user service
        subject: 'Claim Submitted Successfully',
        body: `
          <h2>Claim Submitted</h2>
          <p>Your claim has been submitted successfully.</p>
          <p><strong>Claim Number:</strong> ${event.payload.claimNumber}</p>
          <p><strong>Incident Date:</strong> ${new Date(event.payload.incidentDate).toLocaleDateString()}</p>
          <p><strong>Description:</strong> ${event.payload.damageDescription}</p>
          <p>We will review your claim and get back to you shortly.</p>
        `,
      });
      
      logger.info(`Sent claim submission email for claim ${event.payload.claimNumber}`);
    } catch (error) {
      logger.error('Failed to send claim submission email:', error);
      throw error; // Trigger retry
    }
  });

  /**
   * Handle ClaimStatusChanged event
   */
  subscriber.on('ClaimStatusChanged', async (event) => {
    logger.info(`Processing ClaimStatusChanged event: ${event.eventId}`);
    
    try {
      // Send email to claimant
      await sendEmail({
        to: `claim-${event.payload.claimId}@example.com`, // TODO: Fetch actual email
        subject: `Claim Status Updated: ${event.payload.newStatus}`,
        body: `
          <h2>Claim Status Update</h2>
          <p>Your claim status has been updated.</p>
          <p><strong>Previous Status:</strong> ${event.payload.previousStatus}</p>
          <p><strong>New Status:</strong> ${event.payload.newStatus}</p>
          ${event.payload.reason ? `<p><strong>Reason:</strong> ${event.payload.reason}</p>` : ''}
          <p>Log in to your account to view more details.</p>
        `,
      });
      
      logger.info(`Sent status change email for claim ${event.payload.claimId}`);
    } catch (error) {
      logger.error('Failed to send status change email:', error);
      throw error;
    }
  });

  /**
   * Handle AssessmentCompleted event
   */
  subscriber.on('AssessmentCompleted', async (event) => {
    logger.info(`Processing AssessmentCompleted event: ${event.eventId}`);
    
    try {
      // Send email to insurer
      await sendEmail({
        to: 'insurer@example.com', // TODO: Fetch actual email
        subject: `Assessment Completed for Claim ${event.payload.claimId}`,
        body: `
          <h2>Assessment Completed</h2>
          <p>AI damage assessment has been completed for claim ${event.payload.claimId}.</p>
          <p><strong>Total Cost:</strong> $${event.payload.totalCost.toFixed(2)}</p>
          <p><strong>Labor Cost:</strong> $${event.payload.laborCost.toFixed(2)}</p>
          <p><strong>Parts Cost:</strong> $${event.payload.partsCost.toFixed(2)}</p>
          <p><strong>Paint Cost:</strong> $${event.payload.paintCost.toFixed(2)}</p>
          <p><strong>Confidence:</strong> ${(event.payload.confidence * 100).toFixed(1)}%</p>
          <p><strong>Damage Areas:</strong> ${event.payload.damageAreas.join(', ')}</p>
          <p>Review the assessment in the dashboard.</p>
        `,
      });
      
      logger.info(`Sent assessment completion email for claim ${event.payload.claimId}`);
    } catch (error) {
      logger.error('Failed to send assessment completion email:', error);
      throw error;
    }
  });

  /**
   * Handle FraudAlertRaised event
   */
  subscriber.on('FraudAlertRaised', async (event) => {
    logger.info(`Processing FraudAlertRaised event: ${event.eventId}`);
    
    try {
      // Send email to risk manager
      await sendEmail({
        to: 'risk-manager@example.com', // TODO: Fetch actual email
        subject: `🚨 Fraud Alert: ${event.payload.riskLevel.toUpperCase()} Risk`,
        body: `
          <h2 style="color: red;">Fraud Alert Raised</h2>
          <p>A fraud alert has been raised for claim ${event.payload.claimId}.</p>
          <p><strong>Risk Level:</strong> ${event.payload.riskLevel.toUpperCase()}</p>
          <p><strong>Fraud Score:</strong> ${event.payload.fraudScore.toFixed(2)}</p>
          <p><strong>Indicators:</strong></p>
          <ul>
            ${event.payload.indicators.map(ind => `<li>${ind}</li>`).join('')}
          </ul>
          ${event.payload.requiresInvestigation ? '<p><strong>⚠️ Investigation Required</strong></p>' : ''}
          <p>Review the claim immediately in the fraud detection dashboard.</p>
        `,
      });
      
      logger.info(`Sent fraud alert email for claim ${event.payload.claimId}`);
    } catch (error) {
      logger.error('Failed to send fraud alert email:', error);
      throw error;
    }
  });

  /**
   * Handle QuoteReceived event
   */
  subscriber.on('QuoteReceived', async (event) => {
    logger.info(`Processing QuoteReceived event: ${event.eventId}`);
    
    try {
      // Send email to insurer
      await sendEmail({
        to: 'insurer@example.com', // TODO: Fetch actual email
        subject: `New Quote Received for Claim ${event.payload.claimId}`,
        body: `
          <h2>Quote Received</h2>
          <p>A new repair quote has been submitted for claim ${event.payload.claimId}.</p>
          <p><strong>Panel Beater ID:</strong> ${event.payload.panelBeaterId}</p>
          <p><strong>Total Cost:</strong> $${event.payload.totalCost.toFixed(2)}</p>
          <p><strong>Labor Cost:</strong> $${event.payload.laborCost.toFixed(2)}</p>
          <p><strong>Parts Cost:</strong> $${event.payload.partsCost.toFixed(2)}</p>
          <p><strong>Estimated Days:</strong> ${event.payload.estimatedDays}</p>
          <p>Review the quote in the comparison dashboard.</p>
        `,
      });
      
      logger.info(`Sent quote received email for claim ${event.payload.claimId}`);
    } catch (error) {
      logger.error('Failed to send quote received email:', error);
      throw error;
    }
  });

  /**
   * Handle ApprovalRequested event
   */
  subscriber.on('ApprovalRequested', async (event) => {
    logger.info(`Processing ApprovalRequested event: ${event.eventId}`);
    
    try {
      // Send email to approvers
      for (const approverId of event.payload.requiredApprovers) {
        await sendEmail({
          to: `approver-${approverId}@example.com`, // TODO: Fetch actual email
          subject: `Approval Required: ${event.payload.approvalType}`,
          body: `
            <h2>Approval Required</h2>
            <p>Your approval is required for claim ${event.payload.claimId}.</p>
            <p><strong>Approval Type:</strong> ${event.payload.approvalType}</p>
            ${event.payload.deadline ? `<p><strong>Deadline:</strong> ${new Date(event.payload.deadline).toLocaleString()}</p>` : ''}
            <p>Please review and approve/reject in the dashboard.</p>
          `,
        });
      }
      
      logger.info(`Sent approval request emails for claim ${event.payload.claimId}`);
    } catch (error) {
      logger.error('Failed to send approval request emails:', error);
      throw error;
    }
  });

  // Start consuming events
  await subscriber.start(5); // Process 5 messages concurrently

  logger.info(`${SERVICE_NAME} is consuming events`);

  // Start HTTP server
  app.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} HTTP server listening on port ${PORT}`);
  });

  // Setup graceful shutdown
  setupGracefulShutdown();
  
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await subscriber.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await subscriber.shutdown();
    process.exit(0);
  });
}

// Start the service
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
