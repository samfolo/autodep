# Parser

The `Parser` class definition used to parse build files.

## Usage

```typescript
import {Parser} from './parse';

const tokens = [...];
const parser = new Parser(tokens);
const ast = parser.parse();
```
