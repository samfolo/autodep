import {LogLevel, WorkspacePluginConfig} from '../common/types';

interface LoggerOptions {
  config: WorkspacePluginConfig;
}

interface LogPayload {
  ctx: string;
  message: string;
}

interface LogHistoryEntry {
  timestamp: string;
  level: LogLevel;
  payload: LogPayload;
}

export class Logger {
  private config: WorkspacePluginConfig;
  private permittedLogLevels: Set<LogLevel>;
  private logHistory: LogHistoryEntry[];

  constructor({config}: LoggerOptions) {
    this.config = config;
    this.permittedLogLevels = this.config.log;
    this.logHistory = [];
  }

  private shouldLog = (level: LogLevel) => this.permittedLogLevels.has(level);

  private formatMessage = (timestamp: string, level: LogLevel, payload: LogPayload) => {
    return `${timestamp}\n[${payload.ctx}]: ${level}: ${payload.message}`;
  };

  private logMessage = (level: LogLevel, payload: LogPayload) => {
    if (this.shouldLog(level)) {
      const timestamp = new Date(Date.now()).toLocaleString();
      console[level](this.formatMessage(timestamp, level, payload));
      this.logHistory.push({timestamp, payload, level});
    }
  };

  // readonly trace = (payload: LogPayload) => {...};
  // TODO: think about how to handle trace-level logging.
  readonly debug = (payload: LogPayload) => this.logMessage('debug', payload);
  readonly info = (payload: LogPayload) => this.logMessage('info', payload);
  readonly warning = (payload: LogPayload) => this.logMessage('warn', payload);
  readonly error = (payload: LogPayload) => this.logMessage('error', payload);
}
