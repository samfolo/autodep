import {readFileSync} from 'fs';
import {parse} from 'yaml';

import {initConfig} from '../common/config';
import {CONFIG_FILENAME} from '../common/const';
import {AutodepConfig, AutodepConfigInput} from '../common/types';
import {Logger} from '../logger/log';
import {Messages} from '../messages/message';

export class ConfigurationLoader {
  private _type: 'default' | 'custom';
  private _config: AutodepConfig;
  private _logger: Logger;

  constructor(initialConfig: AutodepConfig) {
    this._type = 'default';
    this._config = Object.freeze(initialConfig);
    this._logger = new Logger({namespace: 'ConfigurationLoader', config: this._config});
  }

  get config() {
    return this._config;
  }

  get type() {
    return this._type;
  }

  loadConfigFromWorkspace = (configPath: string) => {
    if (configPath) {
      try {
        this._logger.debug({
          ctx: 'loadConfigFromWorkspace',
          message: Messages.resolve.attempt(configPath, CONFIG_FILENAME),
        });
        const configInputFile = readFileSync(configPath, {
          encoding: 'utf-8',
          flag: 'r',
        });
        this._logger.debug({
          ctx: 'loadConfigFromWorkspace',
          message: Messages.resolve.success(configPath, CONFIG_FILENAME),
        });

        this._logger.debug({ctx: 'loadConfigFromWorkspace', message: Messages.parse.attempt(CONFIG_FILENAME)});
        const configInput: AutodepConfigInput = parse(configInputFile);
        this._logger.debug({ctx: 'loadConfigFromWorkspace', message: Messages.parse.success(CONFIG_FILENAME)});

        this._config = Object.freeze(initConfig(configInput));
        this._type = 'custom';

        this._logger.info({
          ctx: 'loadConfigFromWorkspace',
          message: `custom configuration successfully loaded:\n${JSON.stringify(this._config, null, 2)}`,
        });
      } catch (error) {
        this._logger.warn({
          ctx: 'loadConfigFromWorkspace',
          message: `could not resolve ${CONFIG_FILENAME} file at ${configPath}`,
          details: error,
        });
      }
    } else {
      this._logger.warn({
        ctx: 'loadConfigFromWorkspace',
        message: `no ${CONFIG_FILENAME} file found at ${configPath}. Using default config.`,
      });
    }

    return this._config;
  };
}
