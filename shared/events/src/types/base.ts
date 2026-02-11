/**
 * Base Event Types for KINGA Event-Driven Architecture
 * 
 * Defines core event structure, metadata, and versioning support
 * for all domain events across microservices.
 */

/**
 * Base domain event structure
 * All events must extend this interface
 */
export interface DomainEvent<T = any> {
  /** Unique event identifier (UUID) */
  eventId: string;
  
  /** Event type identifier (e.g., 'ClaimSubmitted', 'AssessmentCompleted') */
  eventType: string;
  
  /** Event timestamp (ISO 8601 format) */
  timestamp: Date;
  
  /** Event schema version (semver format) */
  version: string;
  
  /** Event payload (domain-specific data) */
  payload: T;
  
  /** Event metadata */
  metadata: EventMetadata;
}

/**
 * Event metadata for tracing and correlation
 */
export interface EventMetadata {
  /** Correlation ID for tracking related events across services */
  correlationId?: string;
  
  /** Causation ID linking this event to the event that caused it */
  causationId?: string;
  
  /** User ID who triggered the event */
  userId?: number;
  
  /** Service that published the event */
  source: string;
  
  /** Additional context-specific metadata */
  [key: string]: any;
}

/**
 * Event publishing options
 */
export interface PublishOptions {
  /** Kafka topic to publish to */
  topic: string;
  
  /** Partition key for ordering guarantees */
  key?: string;
  
  /** Headers for routing and filtering */
  headers?: Record<string, string>;
  
  /** Retry configuration */
  retry?: {
    /** Maximum number of retry attempts */
    maxRetries: number;
    
    /** Initial retry delay in milliseconds */
    initialDelay: number;
    
    /** Backoff multiplier for exponential backoff */
    backoffMultiplier: number;
  };
}

/**
 * Event subscription options
 */
export interface SubscribeOptions {
  /** Kafka topics to subscribe to */
  topics: string[];
  
  /** Consumer group ID for load balancing */
  groupId: string;
  
  /** Start from beginning or latest offset */
  fromBeginning?: boolean;
  
  /** Auto-commit offset after processing */
  autoCommit?: boolean;
  
  /** Maximum number of concurrent messages to process */
  concurrency?: number;
}

/**
 * Event handler function type
 */
export type EventHandler<T = any> = (event: DomainEvent<T>) => Promise<void>;

/**
 * Event validation error
 */
export class EventValidationError extends Error {
  constructor(
    message: string,
    public readonly eventType: string,
    public readonly errors: any[]
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}

/**
 * Event publishing error
 */
export class EventPublishError extends Error {
  constructor(
    message: string,
    public readonly eventType: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EventPublishError';
  }
}

/**
 * Dead letter queue message
 */
export interface DeadLetterMessage {
  /** Original event */
  event: DomainEvent;
  
  /** Error that caused the failure */
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
  
  /** Number of retry attempts */
  retryCount: number;
  
  /** Timestamp when moved to DLQ */
  deadLetterTimestamp: Date;
  
  /** Original topic */
  originalTopic: string;
}

/**
 * Event statistics for monitoring
 */
export interface EventStats {
  /** Total events published */
  published: number;
  
  /** Total events consumed */
  consumed: number;
  
  /** Total events failed */
  failed: number;
  
  /** Total events in DLQ */
  deadLettered: number;
  
  /** Average processing time in milliseconds */
  avgProcessingTime: number;
}
