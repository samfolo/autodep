# Resolver

Contains the `DependencyResolver` class used to manage the resolution of any module file paths needed within the context plugin.

## Usage

```typescript
import {DependencyResolver} from './resolve';

const depResolver = new DependencyResolver();

const absoluteImports = depResolver.resolveAbsoluteImportPaths({
  filePath: 'path/to/<rootDir>/plugin/trigger.file.tsx',
  rootDirName: '<rootDir>',
});
```
