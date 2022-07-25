import {readFileSync} from 'fs';
import {parse} from 'yaml';

import {CONFIG_FILENAME} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {validateConfigInput} from '../config/schema';
import {ConfigUmarshaller} from '../config/unmarshal';
import {AutoDepBase} from '../inheritance/base';
import {ErrorMessages, TaskMessages} from '../messages';

interface ConfigurationLoaderOptions {
  config: AutoDepConfig.Output.Schema;
}

export class ConfigurationLoader extends AutoDepBase {
  private _unmarshallerCls: typeof ConfigUmarshaller;
  private _unmarshaller: ConfigUmarshaller;
  private _configType: 'default' | 'custom';

  constructor({config}: ConfigurationLoaderOptions, unmarshallerCls: typeof ConfigUmarshaller = ConfigUmarshaller) {
    super({config: Object.freeze(config), name: 'ConfigurationLoader'});

    this._unmarshallerCls = unmarshallerCls;
    this._unmarshaller = new this._unmarshallerCls();
    this._configType = 'default';
  }

  loadConfigFromWorkspace = (configPath: string | null) => {
    this._configType = 'default';

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
        this._logger.trace({ctx: 'loadConfigFromWorkspace', message: TaskMessages.parse.success(CONFIG_FILENAME)});

        this._logger.trace({
          ctx: 'loadConfigFromWorkspace',
          message: TaskMessages.attempt('validate', CONFIG_FILENAME),
        });
        const isValidInput = validateConfigInput(configInput);

        if (isValidInput) {
          const successMessage = TaskMessages.success('validated', CONFIG_FILENAME);
          this._logger.trace({ctx: 'loadConfigFromWorkspace', message: successMessage});

          this._status = 'success';
          this._reason = successMessage;
          this._config = Object.freeze(this._unmarshaller.unmarshal(configInput));
          this._configType = 'custom';

          this._logger.trace({
            ctx: 'loadConfigFromWorkspace',
            message: TaskMessages.resolve.success(configPath, CONFIG_FILENAME),
            details: this._config.toString(),
          });
        } else {
          const failureMessage = TaskMessages.failure('validate', CONFIG_FILENAME);
          this._logger.trace({ctx: 'loadConfigFromWorkspace', message: failureMessage});

          this._status = 'failed';
          this._reason = ErrorMessages.user.invalidConfig({
            configPath,
            validationErrors: validateConfigInput.errors,
          });
          this._config = Object.freeze(this._unmarshaller.unmarshal({}));
        }
      } catch (error) {
        this._logger.error({
          ctx: 'loadConfigFromWorkspace',
          message: TaskMessages.resolve.failure(configPath, CONFIG_FILENAME),
          details: error,
        });

        this._status = 'failed';
        this._reason = String(error);
        this._config = Object.freeze(this._unmarshaller.unmarshal({}));
      }
    } else {
      this._status = 'passthrough';
      this._reason = 'no config path passed';
      this._config = Object.freeze(this._unmarshaller.unmarshal({}));
    }

    this._logger.info({
      ctx: 'loadConfigFromWorkspace',
      message: TaskMessages.using(`${this._configType} config`),
      details: this._config.toString(),
    });

    return {
      status: this._status,
      reason: this._reason,
      output: this._config,
    };
  };
}
