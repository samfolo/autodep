# Autodep for VSCode

Autodep for VSCode is an extension which automatically manages BUILD files in [Node.js](https://nodejs.org/en/) projects which use build systems.

## Features

Upon saving a supported file:

- Automatically works out exactly which build targets need to exist within a relevant build rule, and writes them to the appropriate location
- Is able to create and write build rules based on a user-defined schema

Users are able to control the exact type and contents of the new rule to insert via an Autodep configuration file. Definitions can be made for the following three types of Node module:

- `module` - a standard Node module, core to the functionality of the program
- `fixture` - a module which does not contain a test but is not core to the functionality of the program, often containing testing assets (mock data, commonised testing utilities, etc.)
- `test` - a file module containing a test

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

This extension can only be used in projects which use a build system. The extension is currently optimised for use with [Please](https://please.build).

The extension currently only handles Node files at the moment, and will only listen out for `.ts`, `.js`, `.tsx`, `.jsx` and `.scss` files. It can be used in multi-language full-stack projects, however.

## Configuration

Autodep provides a high level of customisation, allowing a user to fine tune its behaviour and increase resilience against even the most esoteric cases one might find in a large, language-agnostic, build-system-dependent repository.

A configuration file can be inserted anywhere within the project, so long as it exists within the specified root directory. It is recommended to place the main configuration file at the root of the directory.

To create a configuration file, just create an `.autodep.yaml` file. The configuration is strongly typed, and a helpful error will be shown within VSCode if configuration has been written incorrectly. Fields are not allowed to be empty, but no fields are mandatory, so feel free to remove them entirely if they are not useful.

### Available fields

- `rootDir` - the name of the directory which should be considered the root of the project. The main configuration file should not be defined at a higher scope than this directory, and preferably should be defined at its root.

- `outDir` - the name of the directory which should be considered the root of the `out` or `dist` directory, defaults to `<rootDir>/plz-out/gen`

  ```yaml
  rootDir: app
  outDir: app/dist
  ```

- `manage` - for convenience, users may create their own build rule definitions. By default, autodep will only create `filegroup` rules.

  - `schema` - Autodep aims to preserve as much formatting and abstraction as possible, and so users are able to specify the names and shapes of custom build rules in the `manage` section. A `manage.schema` entry must be an object against the name of the build rule.

  `manage.schema` entry objects are of type `map[string, array]`. Each `array` can contain a combination of `string` elements, as well as objects with the following shape:

  ```yaml
  value: string
  as: string
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

- `knownTargets` - This field allows you to specify a set of paths (relative to the `rootDir`) and map them directly to targets. Sometimes, it is difficult to define a schema entry for a particular type of rule, and this field is an escape hatch for those situations. This may come in handy for managing the importing of generated files with names not explicitly set by the user, or defined within the implementation of a custom build rule, and thus not discoverable by looking at a BUILD file directly.

  This field should be used as a last resort.

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

## Extension Settings

TBA

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

**Note:** You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

- Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux)
- Toggle preview (`Shift+CMD+V` on macOS or `Shift+Ctrl+V` on Windows and Linux)
- Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets

### For more information

- [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
- [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
