# AST

This directory contains all the AST Node definitions used by the BUILD file parser, as well as a set of utilities to generate ast node objects.

## Usage

```typescript
import * as ast from './utils';
import type {IntegerLiteral, RootNode} from './types';

const expampleToken = {...};

const exampleNode: RootNode = ast.createRootNode({statements: []});

const exampleIntegerLiteralNode: IntegerLiteral = ast.createIntegerLiteralNode({token: expampleToken, value: 4});

// mutable
exampleNode.statements.push(exampleIntegerLiteralNode)
```
