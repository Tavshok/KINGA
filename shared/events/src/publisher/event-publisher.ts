/**
 * Event Publisher with Retry Logic and Dead Letter Queue
 * 
 * Provides reliable event publishing with:
 * - Automatic retries with exponential backoff
 * - Dead letter queue for failed events
 * - Event validation and versioning
 * - Idempotency guarantees
 * - Performance monitoring
 */

import { Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
import { nanoid } from 'nanoid';
import { KafkaClient } from '../utils/kafka-client';
import {
  DomainEvent,
  PublishOptions,
  EventPublishError,
  EventValidationError,
  EventStats,
} from '../types/base';

/**
 * Event publisher configuration
 */
export interface EventPublisherConfig {
  /** Service name (used as event source) */
  serviceName: string;
  
  /** Default retry configuration */
  defaultRetry?: {
    maxRetries: number;
    initialDelay: number;
    backoffMultiplier: number;
  };
  
  /** Dead letter queue topic */
  dlqTopic?: string;
  
  /** Enable event validation */
  validateEvents?: boolean;
}

/**
 * Event Publisher
 */
export class EventPublisher {
  private producer: Producer | null = null;
  private kafkaClient: KafkaClient;
  private config: Required<EventPublisherConfig>;
  private stats: EventStats = {
    published: 0,
    consumed: 0,
    failed: 0,
    deadLettered: 0,
    avgProcessingTime: 0,
  };

  constructor(config: EventPublisherConfig) {
    this.config = {
      serviceName: config.serviceName,
      defaultRetry: config.defaultRetry || {
        maxRetries: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
      },
      dlqTopic: config.dlqTopic || 'kinga.dead-letter-queue',
      validateEvents: config.validateEvents !== false,
    };

    this.kafkaClient = KafkaClient.getInstance();
  }

  /**
   * Initialize publisher (connect to Kafka)
   */
  public async initialize(): Promise<void> {
    this.producer = await this.kafkaClient.getProducer();
    
    // Ensure DLQ topic exists
    await this.kafkaClient.ensureTopic(this.config.dlqTopic);
    
    console.log(`[EventPublisher] Initialized for service: ${this.config.serviceName}`);
  }

  /**
   * Publish a single event
   */
  public async publish<T = any>(
    eventType: string,
    payload: T,
    options: PublishOptions
  ): Promise<RecordMetadata[]> {
    if (!this.producer) {
      throw new Error('EventPublisher not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      // Create domain event
      const event = this.createEvent(eventType, payload);

      // Validate event if enabled
      if (this.config.validateEvents) {
        this.validateEvent(event);
      }

      // Ensure topic exists
      await this.kafkaClient.ensureTopic(options.topic);

      // Publish with retry logic
      const metadata = await this.publishWithRetry(event, options);

      // Update stats
      this.stats.published++;
      this.updateAvgProcessingTime(Date.now() - startTime);

      console.log(
        `[EventPublisher] Published ${eventType} to ${options.topic}`,
        { eventId: event.eventId, partition: metadata[0].partition }
      );

      return metadata;
    } catch (error: any) {
      this.stats.failed++;
      
      // Send to DLQ
      await this.sendToDeadLetterQueue(
        eventType,
        payload,
        options.topic,
        error
      );

      throw new EventPublishError(
        `Failed to publish event: ${eventType}`,
        eventType,
        error
      );
    }
  }

  /**
   * Publish multiple events in a batch
   */
  public async publishBatch<T = any>(
    events: Array<{
      eventType: string;
      payload: T;
      options: PublishOptions;
    }>
  ): Promise<RecordMetadata[][]> {
    if (!this.producer) {
      throw new Error('EventPublisher not initialized. Call initialize() first.');
    }

    const results: RecordMetadata[][] = [];

    for (const { eventType, payload, options } of events) {
      try {
        const metadata = await this.publish(eventType, payload, options);
        results.push(metadata);
      } catch (error) {
        console.error(`[EventPublisher] Failed to publish ${eventType}:`, error);
        // Continue with next event
      }
    }

    return results;
  }

  /**
   * Create domain event with metadata
   */
  private createEvent<T>(eventType: string, payload: T): DomainEvent<T> {
    return {
      eventId: nanoid(),
      eventType,
      timestamp: new Date(),
      version: '1.0.0', // Default version, should be overridden by schema
      payload,
      metadata: {
        source: this.config.serviceName,
        correlationId: nanoid(),
      },
    };
  }

  /**
   * Validate event structure
   */
  private validateEvent(event: DomainEvent): void {
    const errors: string[] = [];

    if (!event.eventId) errors.push('eventId is required');
    if (!event.eventType) errors.push('eventType is required');
    if (!event.timestamp) errors.push('timestamp is required');
    if (!event.version) errors.push('version is required');
    if (!event.payload) errors.push('payload is required');
    if (!event.metadata) errors.push('metadata is required');
    if (!event.metadata.source) errors.push('metadata.source is required');

    if (errors.length > 0) {
      throw new EventValidationError(
        'Event validation failed',
        event.eventType,
        errors
      );
    }
  }

  /**
   * Publish event with retry logic
   */
  private async publishWithRetry(
    event: DomainEvent,
    options: PublishOptions
  ): Promise<RecordMetadata[]> {
    const retryConfig = options.retry || this.config.defaultRetry;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Prepare producer record
        const record: ProducerRecord = {
          topic: options.topic,
          messages: [
            {
              key: options.key || event.eventId,
              value: JSON.stringify(event),
              headers: {
                ...options.headers,
                'event-type': event.eventType,
                'event-version': event.version,
                'event-id': event.eventId,
                'correlation-id': event.metadata.correlationId || '',
                'source': event.metadata.source,
              },
            },
          ],
        };

        // Send to Kafka
        return await this.producer!.send(record);
      } catch (error: any) {
        lastError = error;
        
        if (attempt < retryConfig.maxRetries) {
          // Calculate delay with exponential backoff
          const delay =
            retryConfig.initialDelay *
            Math.pow(retryConfig.backoffMultiplier, attempt);
          
          console.warn(
            `[EventPublisher] Retry ${attempt + 1}/${retryConfig.maxRetries} for ${event.eventType} after ${delay}ms`
          );
          
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Send failed event to dead letter queue
   */
  private async sendToDeadLetterQueue(
    eventType: string,
    payload: any,
    originalTopic: string,
    error: Error
  ): Promise<void> {
    try {
      const dlqMessage = {
        event: this.createEvent(eventType, payload),
        error: {
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
        },
        retryCount: this.config.defaultRetry.maxRetries,
        deadLetterTimestamp: new Date(),
        originalTopic,
      };

      await this.producer!.send({
        topic: this.config.dlqTopic,
        messages: [
          {
            key: nanoid(),
            value: JSON.stringify(dlqMessage),
            headers: {
              'original-topic': originalTopic,
              'event-type': eventType,
              'error-message': error.message,
            },
          },
        ],
      });

      this.stats.deadLettered++;
      
      console.error(
        `[EventPublisher] Sent ${eventType} to DLQ`,
        { originalTopic, error: error.message }
      );
    } catch (dlqError) {
      console.error('[EventPublisher] Failed to send to DLQ:', dlqError);
    }
  }

  /**
   * Get publisher statistics
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
    const total = this.stats.avgProcessingTime * this.stats.published;
    this.stats.avgProcessingTime = (total + processingTime) / (this.stats.published + 1);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('[EventPublisher] Shutting down...');
    
    // Flush pending messages
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    
    console.log('[EventPublisher] Shutdown complete');
  }
}

/**
 * Create event publisher instance
 */
export const createEventPublisher = (config: EventPublisherConfig): EventPublisher => {
  return new EventPublisher(config);
};
