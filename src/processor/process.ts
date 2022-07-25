import {AutoDepConfig} from '../config/types';
import {AutoDepBase} from '../inheritance/base';

interface ProcessorOptions {
  config: AutoDepConfig.Output.Schema;
}

export class Processor extends AutoDepBase {
  constructor({config}: ProcessorOptions) {
    super({config, name: 'Processor'});
  }
}
