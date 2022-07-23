/* eslint-disable @typescript-eslint/naming-convention */
import {LogLevel, AutoDepConfig} from '../common/types';

interface LoggerOptions {
  namespace: string;
  config: AutoDepConfig;
}

interface LogPayload {
  ctx: string;
  message: string;
  details?: any;
}

interface LogHistoryEntry {
  timestamp: string;
  level: LogLevel;
  payload: LogPayload;
}

enum LogType {
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export class Logger {
  private config?: AutoDepConfig | null;
  private permittedLogLevels?: Set<LogLevel>;
  private logHistory?: LogHistoryEntry[];
  private namespace?: string;

  constructor({namespace, config}: LoggerOptions) {
    if (!Logger._instance) {
      this.namespace = namespace;
      this.config = config;
      this.permittedLogLevels = this.config.log;
      this.logHistory = [];
      Logger._instance = this;
    }
  }

  private static _instance: Logger;

  readonly trace = (payload: LogPayload) => Logger._instance.logMessage('debug', LogType.TRACE, payload);
  readonly debug = (payload: LogPayload) => Logger._instance.logMessage('debug', LogType.DEBUG, payload);
  readonly info = (payload: LogPayload) => Logger._instance.logMessage('info', LogType.INFO, payload);
  readonly warn = (payload: LogPayload) => Logger._instance.logMessage('warn', LogType.WARNING, payload);
  readonly error = (payload: LogPayload) => Logger._instance.logMessage('error', LogType.ERROR, payload);

  private readonly shouldLog = (level: LogLevel) => Logger._instance.permittedLogLevels?.has(level);

  private readonly formatMessage = (timestamp: string, type: LogType, payload: LogPayload) => {
    return `${type}: ${timestamp}\n[${this.namespace}::${payload.ctx}]: ${payload.message}` + payload.details
      ? '\ndetails:\n' + payload.details
      : '';
  };

  private readonly logMessage = (level: LogLevel, type: LogType, payload: LogPayload) => {
    if (Logger._instance.shouldLog(level)) {
      const timestamp = new Date(Date.now()).toLocaleString();
      console[level](Logger._instance.formatMessage(timestamp, type, payload));
      Logger._instance.logHistory?.push({timestamp, payload, level});
    }
  };
}
