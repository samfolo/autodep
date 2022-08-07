/* eslint-disable @typescript-eslint/naming-convention */
import {TaskStatus} from '../../common/types';

export class TaskStatusClient {
  private _status: TaskStatus;
  private _reason: string;

  constructor() {
    this._status = 'idle';
    this._reason = 'took no action';
  }

  readonly nextEffect = (triggerStatus: TaskStatus, newReason: string = '') => {
    this._status = TaskStatusClient.STATE_TRIGGER_MAP[`${this._status}:${triggerStatus}`];
    this._reason = newReason;
  };

  readonly forceState = (newStatus: TaskStatus, newReason: string = '') => {
    this._status = newStatus;
    this._reason = newReason;
  };

  readonly getState = () => Object.freeze({status: this._status, reason: this._reason});

  private static STATE_TRIGGER_MAP: Record<`${TaskStatus}:${TaskStatus}`, TaskStatus> = {
    'failed:failed': 'failed',
    'failed:idle': 'idle',
    'failed:partial-success': 'partial-success',
    'failed:passthrough': 'failed',
    'failed:processing': 'processing',
    'failed:success': 'partial-success',

    'idle:failed': 'failed',
    'idle:idle': 'idle',
    'idle:partial-success': 'partial-success',
    'idle:passthrough': 'passthrough',
    'idle:processing': 'processing',
    'idle:success': 'success',

    'partial-success:failed': 'partial-success',
    'partial-success:idle': 'idle',
    'partial-success:partial-success': 'partial-success',
    'partial-success:passthrough': 'partial-success',
    'partial-success:processing': 'processing',
    'partial-success:success': 'partial-success',

    'passthrough:failed': 'failed',
    'passthrough:idle': 'idle',
    'passthrough:partial-success': 'partial-success',
    'passthrough:passthrough': 'passthrough',
    'passthrough:processing': 'processing',
    'passthrough:success': 'success',

    'processing:failed': 'failed',
    'processing:idle': 'idle',
    'processing:partial-success': 'partial-success',
    'processing:passthrough': 'passthrough',
    'processing:processing': 'processing',
    'processing:success': 'success',

    'success:failed': 'partial-success',
    'success:idle': 'idle',
    'success:partial-success': 'partial-success',
    'success:passthrough': 'success',
    'success:processing': 'processing',
    'success:success': 'success',
  };
}
