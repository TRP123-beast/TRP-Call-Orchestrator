import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';

// Winston's File transport does not create parent directories, so ensure it exists.
const logDir = path.resolve(process.cwd(), 'logs');
fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf((info) => {
    const { level, message, timestamp: ts, ...meta } = info;
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${message}${rest}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  // File transports store structured JSON (with stack traces for errors).
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({ filename: path.join(logDir, 'app.log') }),
  ],
});
