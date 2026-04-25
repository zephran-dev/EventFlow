import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ILogger } from '@application/ports';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

export function createLogger(options: {
  level?: string;
  service?: string;
  logDir?: string;
}): ILogger {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? combine(timestamp(), errors({ stack: true }), json())
          : combine(colorize(), simple()),
    }),
  ];

  if (options.logDir) {
    transports.push(
      new DailyRotateFile({
        dirname: options.logDir,
        filename: 'app-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: combine(timestamp(), errors({ stack: true }), json()),
      }),
      new DailyRotateFile({
        dirname: options.logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: '20m',
        maxFiles: '30d',
        format: combine(timestamp(), errors({ stack: true }), json()),
      }),
    );
  }

  const logger = winston.createLogger({
    level: options.level ?? 'info',
    defaultMeta: { service: options.service ?? 'eventflow' },
    transports,
  });

  return {
    info: (message, meta) => logger.info(message, meta),
    warn: (message, meta) => logger.warn(message, meta),
    error: (message, meta) => logger.error(message, meta),
    debug: (message, meta) => logger.debug(message, meta),
  };
}
