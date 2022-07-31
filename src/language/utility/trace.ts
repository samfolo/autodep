import vscode from 'vscode';

import {Token, TokenType} from '../tokeniser/types';

interface TraceEventPayload {
  ctx: string;
  token: Token;
  leadingComment?: string;
  trailingComment?: string;
  message?: string;
}

interface AssertCurrentTokenPayload {
  ctx: string;
  token: Token;
  expectedTypes: TokenType[];
}

interface AssertNextTokenPayload {
  ctx: string;
  token: Token;
  nextToken: Token;
  expectedTypes: TokenType[];
}

interface ParseErrorEventPayload {
  ctx: string;
  token: Token;
  previousTokens: Token[];
  nextTokens: Token[];
}

type TraceEvent = '>' | '<' | '-' | '?' | '!';

export class EventTracer {
  private _traceIndentation: number;

  constructor() {
    this._traceIndentation = 0;
  }

  private static _history: TraceEventPayload[] = [];
  private static _outputChannel = vscode.window.createOutputChannel('Autodep - Parsing Event Tracer');

  readonly enter = (payload: TraceEventPayload) => {
    this.logMessage('>', payload);
    this._traceIndentation++;
  };

  readonly exit = (payload: TraceEventPayload) => {
    this._traceIndentation--;
    this.logMessage('<', payload);
  };

  readonly event = (payload: TraceEventPayload) => {
    this.logMessage('-', payload);
  };

  readonly assertCurrent = (payload: AssertCurrentTokenPayload) => {
    this.logMessage('?', {
      ctx: payload.ctx,
      token: payload.token,
      message: `check if token ${this.formatToken(payload.token)} is "${payload.expectedTypes.join(' | ')}"`,
    });
  };

  readonly assertNext = (payload: AssertNextTokenPayload) => {
    this.logMessage('?', {
      ctx: payload.ctx,
      token: payload.token,
      message: `check if token ${this.formatToken(payload.nextToken)} is "${payload.expectedTypes.join(' | ')}"`,
    });
  };

  readonly error = (payload: ParseErrorEventPayload) => {
    const previousTokens = payload.previousTokens
      .map((token) => this.formatToken(token))
      .join(`\n${this.currentWhitespace()}`);
    const nextTokens = payload.nextTokens.map((token) => this.formatToken(token)).join(`\n${this.currentWhitespace()}`);

    this.logMessage('!', {
      ctx: payload.ctx,
      token: payload.token,
      message: `...\n${this.currentWhitespace()}${previousTokens}\n\n${this.currentWhitespace()}${this.formatToken(
        payload.token
      )}\n\n${this.currentWhitespace()}${nextTokens}\n...`,
    });
  };

  private currentWhitespace = () => ' '.repeat(this._traceIndentation * 2);
  private formatToken = (token: Token) => `[${token?.type}, "${token?.value}"]`;

  private readonly formatMessage = (type: TraceEvent, payload: TraceEventPayload) =>
    `${this.currentWhitespace()}${type} ${payload.ctx} ${this.formatToken(payload.token)}` +
    (payload.leadingComment ? `\n${this.currentWhitespace()}leading: ${payload.leadingComment}` : '') +
    (payload.leadingComment ? `\n${this.currentWhitespace()}trailing: ${payload.leadingComment}` : '') +
    (payload.message ? `\n${this.currentWhitespace()}${payload.message}` : '') +
    '\n';

  private readonly logMessage = (type: TraceEvent, payload: TraceEventPayload) => {
    const message = this.formatMessage(type, payload);
    EventTracer._outputChannel.appendLine(message);
    EventTracer._history.push(payload);
  };
}
