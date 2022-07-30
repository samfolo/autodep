import {TaskStatusClient} from '../clients/taskStatus/task';
import {AutoDepConfig} from '../config/types';
import {Logger} from '../logger/log';

interface AutoDepBaseClassOptions {
  config: AutoDepConfig.Output.Schema;
  name: string;
}

export class AutoDepBase {
  protected _loggerCls: typeof Logger;
  protected _taskStatusClientCls: typeof TaskStatusClient;
  protected _name: string;
  protected _logger: Logger;
  protected _config: AutoDepConfig.Output.Schema;

  constructor(
    {config, name}: AutoDepBaseClassOptions,
    loggerCls: typeof Logger = Logger,
    taskStatusClientCls: typeof TaskStatusClient = TaskStatusClient
  ) {
    this._loggerCls = loggerCls;
    this._taskStatusClientCls = taskStatusClientCls;
    this._name = name;
    this._config = config;
    this._logger = new this._loggerCls({namespace: this._name, config: this._config});
  }

  readonly setConfig = (newConfig: AutoDepConfig.Output.Schema) => {
    this._config = newConfig;
    return this._config;
  };
}
