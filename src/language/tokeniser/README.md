# Tokeniser

The `Tokeniser` class definition used to tokenise a build file.

## Usage

```typescript
import {Tokeniser} from './tokenise';
import type {Token} from './types';

const file: string = '...';
const tokeniser = new Tokeniser(file);
const tokens: Token[] = tokeniser.tokenise();
```
