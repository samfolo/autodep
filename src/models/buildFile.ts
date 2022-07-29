/* eslint-disable @typescript-eslint/naming-convention */
import {AutoDepConfig} from '../config/types';
import {AutoDepBase} from '../inheritance/base';
import {RootNode} from '../language/ast/types';
import {Parser} from '../language/parser/parse';
import {Tokeniser} from '../language/tokeniser/tokenise';
import {TaskMessages} from '../messages/task';

interface BuildFileOptions {
  path: string;
  file: string;
  config: AutoDepConfig.Output.Schema;
}

export class BuildFile extends AutoDepBase {
  private _tokeniserCls: typeof Tokeniser;
  private _parserCls: typeof Parser;
  private _path: string;
  private _file: string;

  constructor({path, file, config}: BuildFileOptions, tokeniserCls = Tokeniser, parserCls = Parser) {
    super({config, name: 'BuildFile'});

    this._tokeniserCls = tokeniserCls;
    this._parserCls = parserCls;
    this._file = file;
    this._path = path;
  }

  static readonly keys = (): string[] => {
    return Object.keys(BuildFile.ASTCache);
  };

  static readonly getASTFromCache = (path: string): RootNode | null => {
    return BuildFile.ASTCache[path] ?? null;
  };

  static readonly deleteASTFromCache = (path: string): boolean => {
    if (BuildFile.ASTCache[path]) {
      delete BuildFile.ASTCache[path];
      return true;
    }
    return false;
  };

  static readonly flushASTCache = () => {
    BuildFile.ASTCache = {};
  };

  private static ASTCache: Record<string, RootNode> = {};

  readonly toAST = () => {
    // using the whole file as a key, in case the contents change and need to be re-parsed
    // this cache won't carry over between arcs-of-operation:
    if (BuildFile.ASTCache[this._path]) {
      this._logger.trace({ctx: 'toAST', message: TaskMessages.using(`cached AST for ${this._path}`)});
      return BuildFile.ASTCache[this._path];
    }

    const tokeniser = new this._tokeniserCls({input: this._file, config: this._config});
    const tokens = tokeniser.tokenise();
    const parser = new this._parserCls({tokens, config: this._config});
    const ast = parser.parse();

    BuildFile.ASTCache[this._path] = ast;
    return ast;
  };
}
