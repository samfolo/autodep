# Autodep for VSCode

Autodep for VSCode is an extension which automatically manages `BUILD` and `BUILD.plz` files in build-system-dependent [Node.js](https://nodejs.org/en/) projects.

## Features

Autodep is primarily configured to run upon the saving a supported file within VSCode. On save, it CAN:

- Work out exactly which build targets need to exist within a file's corresponding build rule, and write them to the appropriate location.
- Create and insert build rules based on a user-defined schema, if a pre-existing rule or `BUILD` file does not exist.

Users are able to control the exact type and contents of the new rule to insert via an Autodep configuration file. Behaviour can be defined for the following three types of file:

- `module` - a standard Node file, core to the functionality of the program
- `fixture` - a module which does not contain a test but is not core to the functionality of the program, often containing testing assets (mock data, commonised testing utilities, etc.)
- `test` - a file containing a test

## Requirements

Autodep can only be used in projects which use a build system. The extension is currently optimised for use with [Please](https://please.build).

Autodep currently only handles Node files at the moment, and will only listen out for `.ts`, `.js`, `.tsx`, `.jsx` and `.scss` files, however it can still be used in multi-language, full-stack projects.

## Configuration

Autodep allows a high level of customisation, allowing a user to fine-tune its behaviour and achieve resilience against even the most esoteric cases one might find in a large, language-agnostic, build-system-dependent project.

A configuration file can be inserted anywhere within the project, so long as it exists within the specified root directory. It is recommended to place the main configuration file at the root of the directory. Subsequent files with tighter scope can be added further down the file tree, then linked via an `extends` field, similar to a `tsconfig.json` file. Extension configuration files will overwrite all clashing parent keys with their new values, except `manage.rules`, which will be concatenated into a (unique) superset of managed rule names.

To create a configuration file, just create an `.autodep.yaml` file. The configuration is strongly typed, and a helpful error will be shown within VSCode if configuration has been written incorrectly. Fields are not allowed to be empty, but no fields are mandatory, so feel free to remove them entirely if they are not useful.

### Available fields

- `rootDir` - the name of the directory which should be considered the root of the project. The main configuration file should not be defined at a higher scope than this directory, and preferably should be defined at its root.

- `outDir` - the name of the directory which should be considered the root of the `out` or `dist` directory, defaults to `<rootDir>/plz-out/gen`

  ```yaml
  rootDir: app
  outDir: app/dist
  ```

- `manage` - for convenience, users may create their own build rule definitions. By default, autodep will only create `filegroup` rules.

  - `rules` - This field is used to specify all the rules which Autodep should bother to check when walking a `BUILD` file at the relevant points in the update process. Only the name needs to be specified here, as the shape is initially assumed to be:

    ```python
    managed_rule(
      name = 'string',
      srcs = [],
      deps = [],
      visibility = [],
    )
    ```

    Deviations from this format can be specified in `manage.schema`

  - `schema` - Autodep aims to preserve as much formatting and abstraction as possible, and so users are able to specify the names and shapes of custom build rules in the `manage` section. A `manage.schema` entry must be an object against the name of the build rule.

    `manage.schema` entry objects are of type `map[string, array]`. Each `array` can contain a combination of `string` elements, as well as objects with the following shape:

    ```yaml
    value: str
    as: str
    ```

    `manage.schema` entry objects are only allowed to contain the following fields (none are mandatory, but at least one must exist to justify the schema entry):

  - `name` - the identifier of the particular instance of the build rule. This field is limited to the `string` type. All other types will throw an error.

    Defaults to `{value: "name", as: "string"}` if not specified.

  - `srcs` - the field which the extension should use to identify whether a particular build rule should be updated based on the Node.js file which triggered the process. This field is limited to the `string`, `array` and `glob` types. All other types will throw an error.

    Defaults to `{value: "srcs", as: "array"}` if not specified.

  - `deps` - the field which the extension should update once it has calculated which dependencies it needs to update. This field is currently limited to the `string` and `array` types. All other types will throw an error.

    Defaults to `{value: "deps", as: "array"}` if not specified.

  - `visibility` - the field which the extension should use to calculate the visibility of target and dependent build rules, if necessary. This field is currently limited to the `string` and `array` types. All other types will throw an error.

    Defaults to `{value: "visibility", as: "array"}` if not specified.

  - `testOnly` - the field which the extension should use to calculate the visibility of any target and dependent build rules, if necessary. This field is currently limited to the `bool` type. All other types will throw an error.

    Defaults to `{value: "test_only", as: "bool"}` if not specified.

  Multiple values can be specified against each of these fields.

  When using the shorthand syntax (entering the field alias as a `string`); the entry will be treated as the `value` value, and the `as` value will be derived from the respective field's default (specified above).

  ```yaml
  manage:
    schema:
      my_custom_rule:
        srcs:
          - my_custom_srcs_alias
      js_library:
        name:
          - value: id
            as: string
        srcs:
          - srcs
          - value: src
            as: string
          - value: srcs
            as: glob
        deps:
          - value: dependencies
            as: array
        visibility:
          - value: visibility
            as: array
      genrule:
        srcs:
          - outs
  ```

- `knownTargets` - This field allows you to specify a set of paths (relative to the `rootDir`) and map them directly to targets. Sometimes, it is difficult to define a schema entry for a particular type of rule, and this field is an escape hatch for those situations. This may come in handy for managing the importing of generated files with names not explicitly set by the user, or defined within the implementation of a custom build rule, and therefore not discoverable by looking at a `BUILD` file directly.

  This field should be used as a last resort, but it may be necessary.

  ```yaml
  manage:
    knownTargets:
      'path/to/generatedFile.ts': //path/to/awkwardly_defined_build_target
  ```

- `match` - This section allows you to specify three matcher fields, used to differentiate between `module`, `test` and `fixture` files. Each field can be defined either as a `regex` string or an array of `extname` entries.

  - `module` defaults to `.*?\.(js|jsx|ts|tsx)$`.
  - `fixture` is unmatchable by default.
  - `test` defaults to `.*?\.(spec|test)\.(js|jsx|ts|tsx)$`.

  These fields are especially important for those who want fine-grained control over how Autodep handles the updating of particular types of files.

  ```yaml
  match:
    module: .*?\.(js|jsx|ts|tsx|scss|json)$
    fixture:
      - .mockData.tsx
      - .fixture.json
      - .specialFile.module.js
    test: .*?\.(spec|test)\.(js|jsx|ts|tsx)$
  ```

- `log` - Autodep provides 5 levels of logging output within VSCode; this field is used to determine which logging levels Autodep should bother populating. Each logging level is given its own channel in the `OUTPUT` section of VSCode.

  - `trace` - for verbose output regarding every decision Autodep is making when calculating dependencies. Useful for debugging and/or deepening your understanding of how targets are resolved by the extension.
  - `info` - only the most important information about the update process: which stage of dependency resolution Autodep is currently taking care of, whether the update was successful or not, how long the process took from the point of saving and occasionally a copy of the stack trace for a particularly fatal error.
  - `debug` - useful if you're interested in the configuration used during a particular run. Also used during the development of the extension.
  - `warn` - used for non-fatal errors and standard warnings; useful when debugging if things are not working as expected
  - `error` - legitimate errors and/or fatal error reporting, complete with stack traces when available.

  ```yaml
  log:
    - trace
    - debug
    - info
    - warn
    - error
  ```

- `excludeNodeModules` - this field allows you to specify whether `node_modules` dependencies should be included within the resolved set of dependencies. If you handle the compilation and inclusion of third-party dependencies with different tooling to your first-party dependencies, you can leave this off. Defaults to `false`.

  ```yaml
  excludeNodeModules: true
  ```

- `enablePropagation` - By default, Autodep will expect the `BUILD` file for a particular Node file to be a direct sibling. This is the optimal location for a `BUILD` file when using a build system, as you should only be building the dependencies to absolutely need. For existing projects who may have single `BUILD` files responsible for several separate targets, or even several separate directories, you may instead want Autodep to update an existing `BUILD` file which resides further up the file tree. This field allows you to opt in to that behaviour.

  Note that if this is turned on, Autodep will walk the entire filesystem until it finds a `BUILD` file, then update that file. It is recommended not to opt in to this behaviour if you are not willing to stay on top of the scoping and location of BUILD targets; this is especially true when paired with wildcard `glob` matchers in `srcs` fields. Defaults to `false`.

  ```yaml
  enablePropagation: false
  ```

- `onCreate` - This section is where you can specify how Autodep should handle the absence of a pre-existing `BUILD` file, or build rule. This situation occurs often, primarily when creating new files in the project.

  - `fileExtname` - the extension of the `BUILD` file. Defaults to an empty string, so a newly created file will be named `BUILD`. Setting it to `plz`, for instance, would mean a newly created file would be named `BUILD.plz`. Value is completely arbitrary.
  - `fileHeading` - An optional comment which can be left at the top of a newly created file upon creation. If a value is set here and in the `onUpdate` section, it will be overwritten on the next update. This is defined as a standard multiline string, and is converted into a comment by the extension. useful for `"DO NOT EDIT"`-style comments.

  <br>The following fields can be specified either at the top-level of `onCreate`, or with more specificity under the `onCreate.module`, `onCreate.fixture` and `onCreate.test` sub-fields:

  - `name` - the name of the rule you wish to be created. Should correspond to a key in `manage.schema`
  - `targetFormat` - a format string for the value which should be passed to the `name` field of the new build rule. The typing of the field will be the first entry in its corresponding schema field entry at `manage.schema[key].name`.
    There are a few magic tokens available to help format the target, derived from the relative path of the target Node.js file:
    - `<basename>` - the name of the file, complete with file extension
    - `<filename>` - the name of the file, without file extension
    - `<firstname>` - the first part of the filename, before the first `.`, if there are several in the basename, e.g. `FirstName.spec.tsx`
    - `<path>` - the full path to the dependency, relative to the `BUILD` file. For sibling files, this will be identical to the `<basename>`.
      These will be interpolated appropriately at runtime.
  - `explicitDeps` - Whether the new rule should be created with the `srcs` explicitly listed, or whether it should be created using the specified `globMatcher` configuration. Defaults to `true`, as this is the optimal setting for build-system-dependent projects. When set to false, the typing of the `srcs` field will be the first entry in its corresponding schema field entry at `manage.schema[key].srcs`.
  - `omitEmptyFields` - Whether the new rule should omit the keyword argument if its value is empty. For `array` types, this would be an array of length `0`; for `string` types, this would be a string of length `0`.
    - Currently unimplemented as of August 2022.
  - `globMatchers` - if `explicitDeps` is set to true, a user is able to specify the values of the `exclude` and `include` fields in a [glob declaration](https://please.build/lexicon.html#please-builtins). These use the familiar `glob` matcher syntax. `glob` fields validate potential files by:
    - checking whether `include` field has a length greater than `1`,
    - checking at least one entry matches the candidate file,
    - checking whether the `exclude` field either has a lengthh of `0`, OR than every entry fails to match the candidate file.
  - `subinclude` - For specifying imports needed for the newly created build rule to work within the project. If the import already exists in the `BUILD` file within a `subinclude` statement, then it will be skipped, else the specified imports will be added to the `BUILD` file, either by creating a new `subinclude`, or merging the imports into any existing `subinclude`.

  <br>The following fields can be specified either at the top-level of `onCreate` or with more specificity, under the `onCreate.module` and `onCreate.fixture` sub-fields. They don't make much sense in the context of a `test` rule:

  - `initialVisibility` - the value which should be passed to the `visibility` field of the new build rule. The typing of the field will be the first entry in its corresponding schema field entry at `manage.schema[key].visibility`.
  - `testOnly` - the value which should be passed to the `testOnly` field of the new build rule. The typing of the field will be the first entry in its corresponding schema field entry at `manage.schema[key].testOnly`.

  ```yaml
  onCreate:
    fileExtname: plz
    fileHeading: |-
      My multiline onCreate file heading
      DO NOT EDIT
    module:
      name: my_custom_module_rule
      targetFormat: <filename>_custom_target
      explicitDeps: true # will now ignore `globMatchers`field
      omitEmptyFields: true
      initialVisibility:
        - PUBLIC
      globMatchers:
        include:
          - '**/*.ts'
          - '**/*.tsx'
        exclude:
          - '**/*.spec.*'
    fixture:
      name: filegroup
      targetFormat: <firstname>_fixture
      testOnly: true
    test:
      name: my_test_rule
      targetFormat: <firstname>_test
      subinclude:
        - //path/to/build_defs:my_test_rule
      explicitDeps: false
      omitEmptyFields: true
      globMatchers:
        include:
          - '**/*.spec.*'
        exclude:
          - '**/some/excludeable/file.spec.*'
  ```

- `onUpdate` - This section is where you can specify how Autodep should handle the updating of a pre-existing `BUILD` file, or build rule. This situation occurs often, primarily when saving a file with a pre-existing rule.

  - `fileHeading` - An optional comment which can be left at the top of a newly created file upon creation. If a value is set here and in the `onCreate` section, any pre-existing `onCreate` comment will be overwritten on the next update. This is defined as a standard multiline string, and is converted into a comment by the extension. useful for `"DO NOT EDIT"`-style comments.

  <br>The following fields can be specified either at the top-level of `onUpdate` or with more specificity, under the `onUpdate.module`, `onUpdate.fixture` and `onUpdate.test` sub-fields:

  - `omitEmptyFields` - Whether the new rule should omit the keyword argument if its value is empty. For `array` types, this would be an array of length `0`; for `string` types, this would be a string of length `0`.
    - Currently unimplemented as of August 2022.
  - `subinclude` - For specifying imports needed for the newly created build rule to work within the project. If the import already exists in the `BUILD` file within a `subinclude` statement, then it will be skipped, else the specified imports will be added to the `BUILD` file, either by creating a new `subinclude`, or merging the imports into any existing `subinclude`.

    For `onUpdate`, this field is useful to persist important build rule imports, if you tend to allow developers to manually tamper with `BUILD` files.

  ```yaml
  onUpdate:
    fileHeading: |-
      My multiline onUpdate file heading
      DO NOT EDIT
    module:
      omitEmptyFields: true
    fixture:
      omitEmptyFields: false
    test:
      omitEmptyFields: true
      subinclude:
        - //stop/removing/my/build_defs:my_test_rule
  ```

- `ignore` - This section is useful for selectively turning off Autodep functionality for particular files and directories, as well as ignoring particular targets in dependency resolution, for whatever reason. Entries can be specified as `glob` matchers for brevity.

  - `paths` - Particular paths Autodep should not attempt to run for. This can be specified at the top-level of `ignore`, or with more specificity under the `ignore.module`, `ignore.test` and `ignore.fixture` sub-fields.
  - `targets` - Particular targets Autodep should not include when calculating which dependencies to write to the target build rule's `deps` field. This can be specified at the top-level of `ignore`, or with more specificity under the `ignore.module`, `ignore.test` and `ignore.fixture` sub-fields.

  ```yaml
  ignore:
    paths:
      - '**/webpack.{production,test,development}.*'
      - path/to/myIgnoredDirectory/*
    module:
      paths:
        - '**/webpack.{production,test,development}.*'
        - path/to/myOnlyIgnoreModuleDirectory/*
      targets:
        - //dont/include/this/awkward/dep
    fixture:
      targets:
        - //dont/include/this/awkward/dep
        - //dont/include/this/awkward/dep:only_for_fixtures
    test:
      targets:
        - //dont/include/this/awkward/dep
        - //dont/include/this/awkward/dep:only_for_tests
  ```

## Extension Settings

TBD - majority of configuration is handled via the `.autodep.yaml` files.

## Known Issues

Autodep does not currently support anything but explicit files in `srcs` fields. There are plans to be able to support build targets in `srcs` fields in the future.

Autodep plans to support the cleanup of old BUILD targets in the future; for now, deleting a file, will leave an orphaned build rule in the corresponsing `BUILD` file

Autodep does not currently support lambdas and list comprehensions in `BUILD` files. The internal parser will be completed in future, but only the most common syntax is covered at the moments. The same is true for complex type-hints.

Autodep will not "correct" visibility issues with pre-existing build targets. For instance, if a dependency `BUILD` file is structured like this:

```python
my_rule(
  name = "my_package",
  srcs = ["index.ts"],
  deps = [":a", ":b"],
  visibility = ["PUBLIC"]
)

my_rule(
  name = "a",
  srcs = ["a.ts"],
  visibility = ["only/this/directory/..."]
)

my_rule(
  name = "b",
  srcs = ["b.ts"],
  visibility = ["only/this/directory/..."]
)
```

And the dependency is imported like this:

```typescript
import {thing} from 'path/to/myPackage/b';
```

It will still try to include `//path/to/my_package:b` - as it should. To correct the build, either:

- Correct the visibility of the dependency
- Import from `path/to/myPackage` instead, as `path/to/myPackage/index.ts` is the visible file, not `path/to/myPackage/b.ts`.

## Release Notes

### 1.0.0

Initial release of Autodep, with core functionality covered
