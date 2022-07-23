import {AutoDepConfig} from '../common/types';

import {Parser} from '../language/parser/parse';
import {Tokeniser} from '../language/tokeniser/tokenise';

interface BuildFileOptions {
  file: string;
  config: AutoDepConfig;
}

export class BuildFile {
  private _file: string;
  private _config: AutoDepConfig;
  private _tokeniserCls: typeof Tokeniser;
  private _parserCls: typeof Parser;

  constructor({file, config}: BuildFileOptions, tokeniserCls = Tokeniser, parserCls = Parser) {
    this._file = file;
    this._config = config;
    this._tokeniserCls = tokeniserCls;
    this._parserCls = parserCls;
  }

  readonly toAST = () => {
    const tokeniser = new this._tokeniserCls(this._file, this._config);
    const tokens = tokeniser.tokenise();
    const parser = new this._parserCls(tokens);
    return parser.parse();
  };
}
