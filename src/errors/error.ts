/* eslint-disable @typescript-eslint/naming-convention */

export enum ErrorType {
  FAILED_PRECONDITION = 'Failed precondition',
  PARSER = 'File parsing error',
  UNEXPECTED = 'Unexpected error',
  USER = 'User error',
}

export class AutoDepError extends Error {
  constructor(code: ErrorType, ...params: any[]) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AutoDepError);
    }

    this.name = '[AutoDepError]';
    this.message = `${code}: ${this.message}`;
  }
}
