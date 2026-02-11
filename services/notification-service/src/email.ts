/**
 * Email Utility
 * 
 * Sends emails using Nodemailer with SMTP configuration.
 */

import nodemailer from 'nodemailer';
import { logger } from './logger';

export interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

/**
 * Create email transporter
 */
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send email
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const info = await transporter.sendMail({
      from: options.from || process.env.SMTP_FROM || 'noreply@kinga.ai',
      to: options.to,
      subject: options.subject,
      html: options.body,
    });

    logger.info(`Email sent: ${info.messageId}`);
  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
}
