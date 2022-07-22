import {LogLevel, AutodepConfig} from '../common/types';

interface LoggerOptions {
  namespace: string;
  config: AutodepConfig;
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

export class Logger {
  private config?: AutodepConfig | null;
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

  // readonly trace = (payload: LogPayload) => {...};
  // TODO: think about how to handle trace-level logging.
  readonly debug = (payload: LogPayload) => Logger._instance.logMessage('debug', payload);
  readonly info = (payload: LogPayload) => Logger._instance.logMessage('info', payload);
  readonly warn = (payload: LogPayload) => Logger._instance.logMessage('warn', payload);
  readonly error = (payload: LogPayload) => Logger._instance.logMessage('error', payload);

  private readonly shouldLog = (level: LogLevel) => Logger._instance.permittedLogLevels?.has(level);

  private readonly formatMessage = (timestamp: string, level: LogLevel, payload: LogPayload) => {
    return `${timestamp}\n[${this.namespace}::${payload.ctx}]: ${level.toUpperCase()}: ${payload.message}` +
      payload.details
      ? '\n' + `${payload.details}}`
      : '';
  };

  private readonly logMessage = (level: LogLevel, payload: LogPayload) => {
    if (Logger._instance.shouldLog(level)) {
      const timestamp = new Date(Date.now()).toLocaleString();
      console[level](Logger._instance.formatMessage(timestamp, level, payload));
      Logger._instance.logHistory?.push({timestamp, payload, level});
    }
  };
}
