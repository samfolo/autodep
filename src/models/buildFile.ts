import {AutoDepConfig} from '../config/types';
import {AutoDepBase} from '../inheritance/base';
import {Parser} from '../language/parser/parse';
import {Tokeniser} from '../language/tokeniser/tokenise';

interface BuildFileOptions {
  file: string;
  config: AutoDepConfig.Output.Schema;
}

export class BuildFile extends AutoDepBase {
  private _tokeniserCls: typeof Tokeniser;
  private _parserCls: typeof Parser;
  private _file: string;

  constructor({file, config}: BuildFileOptions, tokeniserCls = Tokeniser, parserCls = Parser) {
    super({config, name: 'BuildFile'});

    this._tokeniserCls = tokeniserCls;
    this._parserCls = parserCls;
    this._file = file;
  }

  readonly toAST = () => {
    const tokeniser = new this._tokeniserCls({input: this._file, config: this._config});
    const tokens = tokeniser.tokenise();
    const parser = new this._parserCls({tokens, config: this._config});
    return parser.parse();
  };
}
