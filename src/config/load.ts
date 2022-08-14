import {readFileSync} from 'fs';
import merge from 'lodash.merge';
import mergeWith from 'lodash.mergewith';
import path from 'path';
import typescript from 'typescript';
import {parse} from 'yaml';

import {CONFIG_FILENAME, DEFAULT_NON_BINARY_OUT_DIR} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {validateConfigInput} from '../config/schema';
import {ConfigUmarshaller} from '../config/unmarshal';
import {AutoDepBase} from '../inheritance/base';
import {ErrorMessages, TaskMessages} from '../messages';
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
        status: 'passthrough',
        reason: 'no tsconfig',
        output: tsConfig ?? {},
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
              TaskMessages.identified(`\`extends\` clause within ${tsConfigPath}`, configFile.config.extends) +
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
    const taskSatusClient = new this._taskStatusClientCls();

    if (configPath) {
      try {
        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.resolve.attempt(configPath, CONFIG_FILENAME),
        });
        const configInput = this.getExtendedAutoDepConfigFromWorkspace(configPath);
        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.resolve.success(configPath, CONFIG_FILENAME),
        });

        this._logger.trace({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.attempt('validate', CONFIG_FILENAME),
        });
        const isValidInput = validateConfigInput(configInput);

        if (isValidInput) {
          const successMessage = TaskMessages.success('validated', CONFIG_FILENAME);
          this._logger.trace({ctx: 'loadAutoDepConfigFromWorkspace', message: successMessage});

          taskSatusClient.nextEffect('success', successMessage);
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

          taskSatusClient.nextEffect(
            'failed',
            ErrorMessages.user.invalidConfig({
              configPath,
              validationErrors: validateConfigInput.errors,
            })
          );
          this._config = Object.freeze(this._unmarshaller.unmarshal(undefined, this._tsConfigCompilerOptions));
        }
      } catch (error) {
        this._logger.error({
          ctx: 'loadAutoDepConfigFromWorkspace',
          message: TaskMessages.resolve.failure(configPath, CONFIG_FILENAME),
          details: error,
        });

        taskSatusClient.nextEffect('failed', String(error));
        this._config = Object.freeze(this._unmarshaller.unmarshal(undefined, this._tsConfigCompilerOptions));
      }
    } else {
      taskSatusClient.nextEffect('passthrough', 'no config path passed');
      this._config = Object.freeze(this._unmarshaller.unmarshal(undefined, this._tsConfigCompilerOptions));
    }

    this._logger.debug({
      ctx: 'loadAutoDepConfigFromWorkspace',
      message: TaskMessages.using(`${this._configType} config.`),
      details: this._config.toString(),
    });

    const taskState = taskSatusClient.getState();
    return {
      status: taskState.status,
      reason: taskState.reason,
      output: this._config,
    };
  };

  private getExtendedAutoDepConfigFromWorkspace = (
    configPath: string,
    seenCache: Record<string, boolean> = {}
  ): AutoDepConfig.Input.Schema => {
    if (!seenCache[configPath]) {
      this._logger.trace({
        ctx: 'getExtendedAutoDepConfigFromWorkspace',
        message: TaskMessages.resolve.attempt(configPath, CONFIG_FILENAME),
      });
      const configInputFile = readFileSync(configPath, {
        encoding: 'utf-8',
        flag: 'r',
      });
      this._logger.trace({
        ctx: 'getExtendedAutoDepConfigFromWorkspace',
        message: TaskMessages.resolve.success(configPath, CONFIG_FILENAME),
      });

      this._logger.trace({
        ctx: 'getExtendedAutoDepConfigFromWorkspace',
        message: TaskMessages.parse.attempt(CONFIG_FILENAME),
      });
      let configInput: AutoDepConfig.Input.Schema = parse(configInputFile);
      this._logger.trace({
        ctx: 'getExtendedAutoDepConfigFromWorkspace',
        message: TaskMessages.parse.success(CONFIG_FILENAME),
      });

      if (configInput.extends) {
        this._logger.trace({
          ctx: 'getExtendedAutoDepConfigFromWorkspace',
          message:
            TaskMessages.identified(
              `\`<autodepConfig>.extends\` clause within ${CONFIG_FILENAME} at ${configPath}`,
              configInput.extends
            ) + ' - merging configs...',
        });

        // We need this to concatenate arrays in special circumstances:
        const mergeCustomiser = (objectValue: any, sourceValue: any, key: string) => {
          if (key === 'rules' && Array.isArray(objectValue) && Array.isArray(sourceValue)) {
            return Array.from(new Set(objectValue.concat(sourceValue)));
          }
        };

        const {extends: _parentConfigRelativePath, ...thisConfig} = configInput;
        const parentConfigPath = path.resolve(path.dirname(configPath), _parentConfigRelativePath);
        configInput = mergeWith(
          {},
          this.getExtendedAutoDepConfigFromWorkspace(parentConfigPath, seenCache),
          thisConfig,
          mergeCustomiser
        );
      }

      return configInput;
    }

    return {rootDir: '', outDir: DEFAULT_NON_BINARY_OUT_DIR};
  };
}
