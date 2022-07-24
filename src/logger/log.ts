import vscode from 'vscode';

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

export class Logger {
  private _config: AutoDepConfig;
  private namespace: string;

  constructor({namespace, config}: LoggerOptions) {
    this.namespace = namespace;
    this._config = config;
  }

  private get permittedLogLevels() {
    return this._config.log;
  }

  setConfig = (newConfig: AutoDepConfig) => {
    this._config = newConfig;
    return this._config;
  };

  private static _history: LogHistoryEntry[] = [];
  private static _outputChannels = Object.freeze({
    trace: vscode.window.createOutputChannel('Autodep - Trace'),
    debug: vscode.window.createOutputChannel('Autodep - Debug'),
    info: vscode.window.createOutputChannel('Autodep - Info'),
    warn: vscode.window.createOutputChannel('Autodep - Warn'),
    error: vscode.window.createOutputChannel('Autodep - Error'),
  });

  readonly trace = (payload: LogPayload) => this.logMessage('trace', payload);
  readonly debug = (payload: LogPayload) => this.logMessage('debug', payload);
  readonly info = (payload: LogPayload) => this.logMessage('info', payload);
  readonly warn = (payload: LogPayload) => this.logMessage('warn', payload);
  readonly error = (payload: LogPayload) => this.logMessage('error', payload);

  private readonly shouldLog = (level: LogLevel) => this.permittedLogLevels?.has(level);

  private readonly formatMessage = (timestamp: string, level: LogLevel, payload: LogPayload) =>
    `(${timestamp}) ${level.toUpperCase()}: [${this.namespace}::${payload.ctx}]: ${payload.message}` +
    (payload.details ? '\ndetails:\n' + payload.details : '') +
    '\n';

  private readonly logMessage = (level: LogLevel, payload: LogPayload) => {
    if (this.shouldLog(level)) {
      const timestamp = new Date(Date.now()).toLocaleTimeString();
      Logger._outputChannels[level].appendLine(this.formatMessage(timestamp, level, payload));
      Logger._history.push({timestamp, payload, level});
    }
  };
}
