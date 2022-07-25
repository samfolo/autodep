import {readFileSync} from 'fs';
import {parse} from 'yaml';
import vscode from 'vscode';

import {CONFIG_FILENAME} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {validateConfigInput} from '../config/schema';
import {ConfigUmarshaller} from '../config/unmarshal';
import {AutoDepError, ErrorType} from '../errors/error';
import {Logger} from '../logger/log';
import {TaskMessages} from '../messages';

export class ConfigurationLoader {
  private _type: 'default' | 'custom';
  private _config: AutoDepConfig.Output.Schema;
  private _logger: Logger;

  private unmarshallerCls: typeof ConfigUmarshaller;

  private unmarshaller: ConfigUmarshaller;

  constructor(preConfig: AutoDepConfig.Output.Schema, unmarshallerCls: typeof ConfigUmarshaller = ConfigUmarshaller) {
    this.unmarshallerCls = unmarshallerCls;

    this._type = 'default';
    this._config = Object.freeze(preConfig);
    this._logger = new Logger({namespace: 'ConfigurationLoader', config: this._config});

    this.unmarshaller = new this.unmarshallerCls();
  }

  loadConfigFromWorkspace = (configPath: string | null) => {
    this._type = 'default';

    if (configPath) {
      try {
        this._logger.trace({
          ctx: 'loadConfigFromWorkspace',
          message: TaskMessages.resolve.attempt(configPath, CONFIG_FILENAME),
        });
        const configInputFile = readFileSync(configPath, {
          encoding: 'utf-8',
          flag: 'r',
        });
        this._logger.trace({
          ctx: 'loadConfigFromWorkspace',
          message: TaskMessages.resolve.success(configPath, CONFIG_FILENAME),
        });

        this._logger.trace({ctx: 'loadConfigFromWorkspace', message: TaskMessages.parse.attempt(CONFIG_FILENAME)});
        const configInput: AutoDepConfig.Input.Schema = parse(configInputFile);
        const isValidInput = validateConfigInput(configInput);

        if (!isValidInput) {
          this._logger.trace({ctx: 'loadConfigFromWorkspace', message: TaskMessages.parse.success(CONFIG_FILENAME)});
          this._config = Object.freeze(this.unmarshaller.unmarshal(configInput));
          this._type = 'custom';
          this._logger.trace({
            ctx: 'loadConfigFromWorkspace',
            message: TaskMessages.resolve.success(configPath, CONFIG_FILENAME),
            details: this._config.toString(),
          });
        } else {
          throw new AutoDepError(ErrorType.USER, 'invalid config...');
        }
      } catch (error) {
        if (error instanceof AutoDepError) {
          vscode.window.showErrorMessage(String(error));
        }

        this._logger.error({
          ctx: 'loadConfigFromWorkspace',
          message: TaskMessages.resolve.failure(configPath, CONFIG_FILENAME),
          details: error,
        });
        this._config = Object.freeze(this.unmarshaller.unmarshal());
      }
    }

    this._logger.info({
      ctx: 'loadConfigFromWorkspace',
      message: TaskMessages.using(`${this._type} config`),
      details: this._config.toString(),
    });

    return this._config;
  };
}
