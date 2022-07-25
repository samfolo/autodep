import {AutoDepConfig} from '../config/types';
import {Logger} from '../logger/log';

interface AutoDepBaseClassOptions {
  config: AutoDepConfig.Output.Schema;
  name: string;
}

export class AutoDepBase {
  protected _name: string;
  protected _config: AutoDepConfig.Output.Schema;
  protected _logger: Logger;
  protected _status: 'idle' | 'passthrough' | 'success' | 'failed' | 'processing';
  protected _reason: string;

  constructor({config, name}: AutoDepBaseClassOptions) {
    this._name = name;
    this._config = config;
    this._logger = new Logger({namespace: this._name, config: this._config});
    this._status = 'idle';
    this._reason = 'took no action';
  }

  readonly setConfig = (newConfig: AutoDepConfig.Output.Schema) => {
    this._config = newConfig;
    return this._config;
  };
}
