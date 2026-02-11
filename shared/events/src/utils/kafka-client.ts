/**
 * Kafka Client Configuration and Initialization
 * 
 * Provides centralized Kafka client management with connection pooling,
 * health checks, and graceful shutdown.
 */

import { Kafka, KafkaConfig, Producer, Consumer, Admin, logLevel } from 'kafkajs';

/**
 * KINGA Kafka client configuration
 */
export interface KingaKafkaConfig {
  /** Kafka broker URLs */
  brokers: string[];
  
  /** Client ID for identification */
  clientId: string;
  
  /** SASL authentication (optional) */
  sasl?: {
    mechanism: string;
    username: string;
    password: string;
  };
  
  /** SSL/TLS configuration (optional) */
  ssl?: boolean;
  
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  
  /** Log level */
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Kafka client singleton
 */
export class KafkaClient {
  private static instance: KafkaClient;
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private admin: Admin | null = null;
  private isConnected: boolean = false;

  private constructor(config: KingaKafkaConfig) {
    const kafkaConfig: KafkaConfig = {
      clientId: config.clientId,
      brokers: config.brokers,
      connectionTimeout: config.connectionTimeout || 10000,
      requestTimeout: config.requestTimeout || 30000,
      logLevel: this.mapLogLevel(config.logLevel || 'info'),
    };

    // Add SASL authentication if provided
    if (config.sasl) {
      kafkaConfig.sasl = config.sasl as any;
    }

    // Add SSL if enabled
    if (config.ssl) {
      kafkaConfig.ssl = true;
    }

    this.kafka = new Kafka(kafkaConfig);
  }

  /**
   * Get or create Kafka client instance
   */
  public static getInstance(config?: KingaKafkaConfig): KafkaClient {
    if (!KafkaClient.instance) {
      if (!config) {
        throw new Error('KafkaClient not initialized. Provide config on first call.');
      }
      KafkaClient.instance = new KafkaClient(config);
    }
    return KafkaClient.instance;
  }

  /**
   * Initialize Kafka client from environment variables
   */
  public static fromEnv(): KafkaClient {
    const config: KingaKafkaConfig = {
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      clientId: process.env.KAFKA_CLIENT_ID || 'kinga-service',
      connectionTimeout: parseInt(process.env.KAFKA_CONNECTION_TIMEOUT || '10000'),
      requestTimeout: parseInt(process.env.KAFKA_REQUEST_TIMEOUT || '30000'),
      logLevel: (process.env.KAFKA_LOG_LEVEL as any) || 'info',
    };

    // Add SASL if configured
    if (process.env.KAFKA_SASL_MECHANISM) {
      config.sasl = {
        mechanism: process.env.KAFKA_SASL_MECHANISM as any,
        username: process.env.KAFKA_SASL_USERNAME || '',
        password: process.env.KAFKA_SASL_PASSWORD || '',
      };
    }

    // Add SSL if enabled
    if (process.env.KAFKA_SSL === 'true') {
      config.ssl = true;
    }

    return KafkaClient.getInstance(config);
  }

  /**
   * Get or create producer
   */
  public async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,
        transactionTimeout: 30000,
        idempotent: true, // Ensure exactly-once semantics
        maxInFlightRequests: 5,
        retry: {
          retries: 5,
          initialRetryTime: 300,
          multiplier: 2,
        },
      });

      await this.producer.connect();
      this.isConnected = true;
      console.log('[KafkaClient] Producer connected');
    }

    return this.producer;
  }

  /**
   * Get or create consumer
   */
  public async getConsumer(groupId: string): Promise<Consumer> {
    if (!this.consumers.has(groupId)) {
      const consumer = this.kafka.consumer({
        groupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        maxBytesPerPartition: 1048576, // 1MB
        retry: {
          retries: 5,
          initialRetryTime: 300,
          multiplier: 2,
        },
      });

      await consumer.connect();
      this.consumers.set(groupId, consumer);
      console.log(`[KafkaClient] Consumer connected: ${groupId}`);
    }

    return this.consumers.get(groupId)!;
  }

  /**
   * Get or create admin client
   */
  public async getAdmin(): Promise<Admin> {
    if (!this.admin) {
      this.admin = this.kafka.admin();
      await this.admin.connect();
      console.log('[KafkaClient] Admin client connected');
    }

    return this.admin;
  }

  /**
   * Check if Kafka is connected
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const admin = await this.getAdmin();
      await admin.listTopics();
      return true;
    } catch (error) {
      console.error('[KafkaClient] Health check failed:', error);
      return false;
    }
  }

  /**
   * Create topic if it doesn't exist
   */
  public async ensureTopic(
    topic: string,
    numPartitions: number = 3,
    replicationFactor: number = 1
  ): Promise<void> {
    try {
      const admin = await this.getAdmin();
      const topics = await admin.listTopics();

      if (!topics.includes(topic)) {
        await admin.createTopics({
          topics: [
            {
              topic,
              numPartitions,
              replicationFactor,
              configEntries: [
                { name: 'retention.ms', value: '604800000' }, // 7 days
                { name: 'compression.type', value: 'snappy' },
              ],
            },
          ],
        });
        console.log(`[KafkaClient] Topic created: ${topic}`);
      }
    } catch (error: any) {
      if (error.type !== 'TOPIC_ALREADY_EXISTS') {
        throw error;
      }
    }
  }

  /**
   * Graceful shutdown
   */
  public async disconnect(): Promise<void> {
    console.log('[KafkaClient] Disconnecting...');

    // Disconnect producer
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    // Disconnect all consumers
    const consumerEntries = Array.from(this.consumers.entries());
    for (const [groupId, consumer] of consumerEntries) {
      await consumer.disconnect();
      console.log(`[KafkaClient] Consumer disconnected: ${groupId}`);
    }
    this.consumers.clear();

    // Disconnect admin
    if (this.admin) {
      await this.admin.disconnect();
      this.admin = null;
    }

    this.isConnected = false;
    console.log('[KafkaClient] Disconnected');
  }

  /**
   * Map log level to KafkaJS log level
   */
  private mapLogLevel(level: string): logLevel {
    switch (level) {
      case 'error':
        return logLevel.ERROR;
      case 'warn':
        return logLevel.WARN;
      case 'info':
        return logLevel.INFO;
      case 'debug':
        return logLevel.DEBUG;
      default:
        return logLevel.INFO;
    }
  }
}

/**
 * Initialize Kafka client on module load
 */
export const initializeKafkaClient = (config?: KingaKafkaConfig): KafkaClient => {
  if (config) {
    return KafkaClient.getInstance(config);
  }
  return KafkaClient.fromEnv();
};

/**
 * Graceful shutdown handler
 */
export const setupGracefulShutdown = (): void => {
  const shutdown = async (signal: string) => {
    console.log(`[KafkaClient] Received ${signal}, shutting down gracefully...`);
    try {
      const client = KafkaClient.getInstance();
      await client.disconnect();
      process.exit(0);
    } catch (error) {
      console.error('[KafkaClient] Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
