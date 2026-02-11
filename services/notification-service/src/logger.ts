/**
 * Logger Utility
 * 
 * Structured logging for the notification service.
 */

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      message,
      ...args,
    }));
  },

  error: (message: string, error?: any) => {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      message,
      error: error?.message || error,
      stack: error?.stack,
    }));
  },

  warn: (message: string, ...args: any[]) => {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      message,
      ...args,
    }));
  },

  debug: (message: string, ...args: any[]) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(JSON.stringify({
        level: 'debug',
        timestamp: new Date().toISOString(),
        service: 'notification-service',
        message,
        ...args,
      }));
    }
  },
};
