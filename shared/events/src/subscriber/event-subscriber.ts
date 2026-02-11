/**
 * Event Subscriber with Consumer Groups and Error Handling
 * 
 * Provides reliable event consumption with:
 * - Consumer group management for load balancing
 * - Automatic retries with exponential backoff
 * - Dead letter queue for failed events
 * - Concurrent message processing
 * - Graceful shutdown
 */

import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { KafkaClient } from '../utils/kafka-client';
import {
  DomainEvent,
  SubscribeOptions,
  EventHandler,
  EventStats,
  DeadLetterMessage,
} from '../types/base';

/**
 * Event subscriber configuration
 */
export interface EventSubscriberConfig {
  /** Service name (for logging) */
  serviceName: string;
  
  /** Default subscription options */
  defaultOptions?: Partial<SubscribeOptions>;
  
  /** Dead letter queue topic */
  dlqTopic?: string;
  
  /** Maximum retry attempts before sending to DLQ */
  maxRetries?: number;
  
  /** Initial retry delay in milliseconds */
  initialRetryDelay?: number;
  
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier?: number;
}

/**
 * Event handler registration
 */
interface HandlerRegistration {
  eventType: string;
  handler: EventHandler;
  retryCount?: number;
}

/**
 * Event Subscriber
 */
export class EventSubscriber {
  private consumer: Consumer | null = null;
  private kafkaClient: KafkaClient;
  private config: Required<EventSubscriberConfig>;
  private handlers: Map<string, EventHandler> = new Map();
  private stats: EventStats = {
    published: 0,
    consumed: 0,
    failed: 0,
    deadLettered: 0,
    avgProcessingTime: 0,
  };
  private isRunning: boolean = false;

  constructor(config: EventSubscriberConfig) {
    this.config = {
      serviceName: config.serviceName,
      defaultOptions: config.defaultOptions || {},
      dlqTopic: config.dlqTopic || 'kinga.dead-letter-queue',
      maxRetries: config.maxRetries || 3,
      initialRetryDelay: config.initialRetryDelay || 1000,
      backoffMultiplier: config.backoffMultiplier || 2,
    };

    this.kafkaClient = KafkaClient.getInstance();
  }

  /**
   * Initialize subscriber (connect to Kafka)
   */
  public async initialize(options: SubscribeOptions): Promise<void> {
    const finalOptions = {
      ...this.config.defaultOptions,
      ...options,
    };

    this.consumer = await this.kafkaClient.getConsumer(finalOptions.groupId);

    // Subscribe to topics
    await this.consumer.subscribe({
      topics: finalOptions.topics,
      fromBeginning: finalOptions.fromBeginning || false,
    });

    console.log(
      `[EventSubscriber] Initialized for service: ${this.config.serviceName}`,
      { groupId: finalOptions.groupId, topics: finalOptions.topics }
    );
  }

  /**
   * Register event handler
   */
  public on(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
    console.log(`[EventSubscriber] Registered handler for: ${eventType}`);
  }

  /**
   * Register multiple event handlers
   */
  public onMany(handlers: Record<string, EventHandler>): void {
    for (const [eventType, handler] of Object.entries(handlers)) {
      this.on(eventType, handler);
    }
  }

  /**
   * Start consuming events
   */
  public async start(concurrency: number = 1): Promise<void> {
    if (!this.consumer) {
      throw new Error('EventSubscriber not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      console.warn('[EventSubscriber] Already running');
      return;
    }

    this.isRunning = true;

    await this.consumer.run({
      partitionsConsumedConcurrently: concurrency,
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    console.log(`[EventSubscriber] Started consuming events (concurrency: ${concurrency})`);
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const startTime = Date.now();

    try {
      // Parse event
      const event: DomainEvent = JSON.parse(message.value!.toString());
      const eventType = event.eventType;

      console.log(
        `[EventSubscriber] Received ${eventType} from ${topic}`,
        { partition, offset: message.offset, eventId: event.eventId }
      );

      // Find handler
      const handler = this.handlers.get(eventType);
      if (!handler) {
        console.warn(`[EventSubscriber] No handler registered for: ${eventType}`);
        return;
      }

      // Process event with retry logic
      await this.processWithRetry(event, handler);

      // Update stats
      this.stats.consumed++;
      this.updateAvgProcessingTime(Date.now() - startTime);

      console.log(
        `[EventSubscriber] Processed ${eventType}`,
        { eventId: event.eventId, processingTime: Date.now() - startTime }
      );
    } catch (error: any) {
      this.stats.failed++;
      
      console.error(
        `[EventSubscriber] Failed to process message from ${topic}`,
        { partition, offset: message.offset, error: error.message }
      );

      // Send to DLQ
      await this.sendToDeadLetterQueue(
        message.value!.toString(),
        topic,
        error
      );
    }
  }

  /**
   * Process event with retry logic
   */
  private async processWithRetry(
    event: DomainEvent,
    handler: EventHandler,
    retryCount: number = 0
  ): Promise<void> {
    try {
      await handler(event);
    } catch (error: any) {
      if (retryCount < this.config.maxRetries) {
        // Calculate delay with exponential backoff
        const delay =
          this.config.initialRetryDelay *
          Math.pow(this.config.backoffMultiplier, retryCount);

        console.warn(
          `[EventSubscriber] Retry ${retryCount + 1}/${this.config.maxRetries} for ${event.eventType} after ${delay}ms`
        );

        await this.sleep(delay);
        return this.processWithRetry(event, handler, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Send failed event to dead letter queue
   */
  private async sendToDeadLetterQueue(
    messageValue: string,
    originalTopic: string,
    error: Error
  ): Promise<void> {
    try {
      const event: DomainEvent = JSON.parse(messageValue);

      const dlqMessage: DeadLetterMessage = {
        event,
        error: {
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
        },
        retryCount: this.config.maxRetries,
        deadLetterTimestamp: new Date(),
        originalTopic,
      };

      // Get producer to send to DLQ
      const producer = await this.kafkaClient.getProducer();
      
      await producer.send({
        topic: this.config.dlqTopic,
        messages: [
          {
            key: event.eventId,
            value: JSON.stringify(dlqMessage),
            headers: {
              'original-topic': originalTopic,
              'event-type': event.eventType,
              'event-id': event.eventId,
              'error-message': error.message,
              'service': this.config.serviceName,
            },
          },
        ],
      });

      this.stats.deadLettered++;

      console.error(
        `[EventSubscriber] Sent ${event.eventType} to DLQ`,
        { originalTopic, eventId: event.eventId, error: error.message }
      );
    } catch (dlqError) {
      console.error('[EventSubscriber] Failed to send to DLQ:', dlqError);
    }
  }

  /**
   * Get subscriber statistics
   */
  public getStats(): EventStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      published: 0,
      consumed: 0,
      failed: 0,
      deadLettered: 0,
      avgProcessingTime: 0,
    };
  }

  /**
   * Update average processing time
   */
  private updateAvgProcessingTime(processingTime: number): void {
    const total = this.stats.avgProcessingTime * this.stats.consumed;
    this.stats.avgProcessingTime = (total + processingTime) / (this.stats.consumed + 1);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Pause consumption
   */
  public async pause(): Promise<void> {
    if (!this.consumer) {
      throw new Error('EventSubscriber not initialized');
    }

    // Pause all assigned partitions
    await (this.consumer as any).pause();
    
    console.log('[EventSubscriber] Paused');
  }

  /**
   * Resume consumption
   */
  public async resume(): Promise<void> {
    if (!this.consumer) {
      throw new Error('EventSubscriber not initialized');
    }

    // Resume all assigned partitions
    (this.consumer as any).resume();
    
    console.log('[EventSubscriber] Resumed');
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('[EventSubscriber] Shutting down...');

    this.isRunning = false;

    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }

    console.log('[EventSubscriber] Shutdown complete');
  }
}

/**
 * Create event subscriber instance
 */
export const createEventSubscriber = (config: EventSubscriberConfig): EventSubscriber => {
  return new EventSubscriber(config);
};
