# De-aliasing client

Contains the `DeAliasingClient` class used to:

- De-alias imports with yarn workspace aliases
- De-alias known, user-set aliases (set in the plugin config)

## Usage

```json
// common/js/types/package.json

{
  "name": "@core/common-types",
  "etc": "etc"
}

// internal/ts/libraries/directory/package.json

{
  "name": "@core/internal-lib",
  "etc": "etc"
}

// misc/location/three/package.json

{
  "name": "some-third-alias",
  "etc": "etc"
}

// <rootDir>/package.json

{
  "workspaces": {
    "packages": ["common/js/types", "internal/ts/libraries/directory", "some-third-alias"]
  }
}
```

```typescript
import {DeAliasingClient} from './deAlias';

const client = new DeAliasingClient({
  filePath: '/absolute/path/to/<rootDir>/plugin/listener/trigger/file.ts',
  rootDirName: '<rootDir>',
  knownPathAliases: {
    '@plz-alias/*': ['./*', './plz-out/gen/*'],
    '@my-alias': ['@really-long-npm-package-name/some-subdir'],
  },
});

// returns "misc/location/three/path/to/some/file.js":
client.deAlias('@core/internal-lib/path/to/some/first/file.js');

// returns either "./path/to/some/second/file.js" OR "./plz-out/gen/path/to/some/second/file.js", (whichever works first):
client.deAlias('@plz-alias/path/to/some/second/file.js');
```
