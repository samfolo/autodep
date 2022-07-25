import vscode from 'vscode';

import {LogLevel} from '../common/types';
import {AutoDepConfig} from '../config/types';

interface LoggerOptions {
  namespace: string;
  config: AutoDepConfig.Output.Schema;
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
  private _config: AutoDepConfig.Output.Schema;
  private _namespace: string;

  constructor({namespace, config}: LoggerOptions) {
    this._config = config;
    this._namespace = namespace;
  }

  private get _permittedLogLevels() {
    return this._config.log;
  }

  setConfig = (newConfig: AutoDepConfig.Output.Schema) => {
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

  private readonly shouldLog = (level: LogLevel) => this._permittedLogLevels?.has(level);

  private readonly formatMessage = (timestamp: string, level: LogLevel, payload: LogPayload) =>
    `(${timestamp}) ${level.toUpperCase()}: [${this._namespace}::${payload.ctx}]: ${payload.message}` +
    (payload.details ? '\ndetails:\n' + payload.details : '') +
    '\n';

  private readonly logMessage = (level: LogLevel, payload: LogPayload) => {
    if (this.shouldLog(level)) {
      const timestamp = new Date(Date.now()).toLocaleTimeString();
      const message = this.formatMessage(timestamp, level, payload);
      Logger._outputChannels[level].appendLine(message);
      Logger._history.push({timestamp, payload, level});
      return message;
    }
  };
}
