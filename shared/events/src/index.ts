/**
 * @kinga/events - Event-Driven Architecture Library
 * 
 * Main entry point for the KINGA event system.
 * Exports all publishers, subscribers, schemas, and utilities.
 * 
 * @author Tavonga Shoko
 * @version 1.0.0
 */

// Core types
export * from './types/base';

// Kafka client
export * from './utils/kafka-client';

// Publisher
export * from './publisher/event-publisher';

// Subscriber
export * from './subscriber/event-subscriber';

// Event schemas
export * from './schemas/index';

// Re-export commonly used functions
export { initializeKafkaClient, setupGracefulShutdown } from './utils/kafka-client';
export { createEventPublisher } from './publisher/event-publisher';
export { createEventSubscriber } from './subscriber/event-subscriber';
export { validateEvent, getTopicName } from './schemas/index';
