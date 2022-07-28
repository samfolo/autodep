import {readFileSync} from 'fs';
import merge from 'lodash.merge';
import typescript from 'typescript';
import {parse} from 'yaml';

import {CONFIG_FILENAME} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {validateConfigInput} from '../config/schema';
import {ConfigUmarshaller} from '../config/unmarshal';
import {AutoDepBase} from '../inheritance/base';
import {ErrorMessages, TaskMessages} from '../messages';
import path from 'path';
import {TaskStatus} from '../common/types';

interface ConfigurationLoaderOptions {
  config: AutoDepConfig.Output.Schema;
}

export class ConfigurationLoader extends AutoDepBase {
  private _unmarshallerCls: typeof ConfigUmarshaller;
  private _unmarshaller: ConfigUmarshaller;
  private _configType: 'default' | 'custom';
  private _tsConfigCompilerOptions: typescript.CompilerOptions;

  constructor({config}: ConfigurationLoaderOptions, unmarshallerCls: typeof ConfigUmarshaller = ConfigUmarshaller) {
    super({config: Object.freeze(config), name: 'ConfigurationLoader'});

    this._unmarshallerCls = unmarshallerCls;
    this._unmarshaller = new this._unmarshallerCls();
    this._configType = 'default';
    this._tsConfigCompilerOptions = {};
  }

  loadTsConfigFromWorkspace = (
    rootPath: string
  ): {
    status: TaskStatus;
    reason: string;
    output: {compilerOptions?: typescript.CompilerOptions};
  } => {
    this._logger.trace({
      ctx: 'loadTsConfigFromWorkspace',
      message: TaskMessages.resolve.attempt(rootPath, 'tsconfig.json'),
    });

    const tsConfig = this.getExtendedTsConfigFromWorkspace(rootPath, {});

    if (Object.keys(tsConfig ?? {}).length === 0) {
      this._logger.trace({
        ctx: 'loadTsConfigFromWorkspace',
        message: TaskMessages.resolve.failure(rootPath, 'tsconfig.json'),
      });

      return {
        status: 'failed',
        reason: 'no tsconfig',
        output: tsConfig,
      };
    }

    const successMessage = TaskMessages.resolve.success(rootPath, 'tsconfig.json');
    this._logger.trace({
      ctx: 'loadTsConfigFromWorkspace',
      message: successMessage,
    });

    this._tsConfigCompilerOptions = tsConfig.compilerOptions ?? {};
    return {
      status: 'success',
      reason: successMessage,
      output: tsConfig,
    };
  };

  private getExtendedTsConfigFromWorkspace = (
    rootPath: string,
    seenCache: Record<string, boolean> = {}
  ): {compilerOptions?: typescript.CompilerOptions} => {
    if (!seenCache[rootPath]) {
      const tsConfigPath = typescript.findConfigFile(rootPath, typescript.sys.fileExists);
      this._logger.trace({
        ctx: 'getExtendedTsConfigFromWorkspace',
        message: TaskMessages.resolve.success(rootPath, tsConfigPath),
      });
      if (tsConfigPath) {
        const configFile = typescript.readConfigFile(tsConfigPath, typescript.sys.readFile);

        if (configFile.config.extends) {
          this._logger.trace({
            ctx: 'getExtendedTsConfigFromWorkspace',
            message:
              TaskMessages.identified(`"\`extends\` clause within ${tsConfigPath}`, configFile.config.extends) +
              ' - merging configs...',
          });
          const {extends: _parentConfigRelativePath, ...thisConfig} = configFile.config;
          const parentConfigPath = path.resolve(path.dirname(tsConfigPath), _parentConfigRelativePath);

          return merge(
            {},
            this.getExtendedTsConfigFromWorkspace(parentConfigPath, {...seenCache, [tsConfigPath]: true}),
            merge({}, thisConfig, {compilerOptions: {baseUrl: path.dirname(parentConfigPath)}})
          );
        }

        return configFile.config;
      }
    }
    return {};
  };

  loadAutoDepConfigFromWorkspace = (configPath: string | null) => {
    this._configType = 'default';

    if (configPath) {
      try {
        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.resolve.attempt(configPath, CONFIG_FILENAME),
        });
        const configInputFile = readFileSync(configPath, {
          encoding: 'utf-8',
          flag: 'r',
        });
        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.resolve.success(configPath, CONFIG_FILENAME),
        });

        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.parse.attempt(CONFIG_FILENAME),
        });
        const configInput: AutoDepConfig.Input.Schema = parse(configInputFile);
        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.parse.success(CONFIG_FILENAME),
        });

        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.attempt('validate', CONFIG_FILENAME),
        });
        const isValidInput = validateConfigInput(configInput);

        if (isValidInput) {
          const successMessage = TaskMessages.success('validated', CONFIG_FILENAME);
          this._logger.trace({ctx: 'loadAutoDepConfigFromWorkspace', message: successMessage});

          this._status = 'success';
          this._reason = successMessage;
          this._config = Object.freeze(this._unmarshaller.unmarshal(configInput, this._tsConfigCompilerOptions));
          this._configType = 'custom';

          this._logger.trace({
            ctx: 'loadAutoDepConfigFromWorkspace',
            message: TaskMessages.resolve.success(configPath, CONFIG_FILENAME),
            details: this._config.toString(),
          });
        } else {
          const failureMessage = TaskMessages.failure('validate', CONFIG_FILENAME);
          this._logger.trace({ctx: 'loadAutoDepConfigFromWorkspace', message: failureMessage});

          this._status = 'failed';
          this._reason = ErrorMessages.user.invalidConfig({
            configPath,
            validationErrors: validateConfigInput.errors,
          });
          this._config = Object.freeze(this._unmarshaller.unmarshal(undefined, this._tsConfigCompilerOptions));
        }
      } catch (error) {
        this._logger.error({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.resolve.failure(configPath, CONFIG_FILENAME),
          details: error,
        });

        this._status = 'failed';
        this._reason = String(error);
        this._config = Object.freeze(this._unmarshaller.unmarshal(undefined, this._tsConfigCompilerOptions));
      }
    } else {
      this._status = 'passthrough';
      this._reason = 'no config path passed';
      this._config = Object.freeze(this._unmarshaller.unmarshal(undefined, this._tsConfigCompilerOptions));
    }

    this._logger.debug({
      ctx: 'loadAutoDepConfigFromWorkspace',
      message: TaskMessages.using(`${this._configType} config.`),
      details: this._config.toString(),
    });

    return {
      status: this._status,
      reason: this._reason,
      output: this._config,
    };
  };
}
