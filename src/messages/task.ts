export class TaskMessages {
  /**
   * A string formatting utility
   *
   * @param action the action in future-tense, e.g. `"find"`
   * @param subject the target of the action, e.g. `"my keys"`
   * @returns
   * ```javascript
   * `attempting to ${action} ${subject}`
   * ```
   * @example attempt('find', 'my keys') => 'attempting to find my keys'
   */
  static readonly attempt = (action: string, subject: string) => `attempting to ${action} ${subject}`;
  /**
   * A string formatting utility
   *
   * @param result the action in past-tense, e.g. `"found"`
   * @param subject the target of the action, e.g. `"my keys"`
   * @returns
   * ```javascript
   * `successfully ${result} ${subject}`
   * ```
   * @example success('found', 'my keys') => 'successfully found my keys'
   */
  static readonly success = (result: string, subject: string) => `successfully ${result} ${subject}`;
  /**
   * A string formatting utility
   *
   * @param action the action as an infinitive, e.g. `"find"`
   * @param subject the target of the action, e.g. `"my keys"`
   * @returns
   * ```javascript
   * `failed to ${action} ${subject}`
   * ```
   * @example failure('find', 'my keys') => 'failed to find my keys'
   */
  static readonly failure = (action: string, subject: string) => `failed to ${action} ${subject}`;

  /**
   * A string formatting utility
   *
   * @param subject the unexpected element, e.g. `"error"`. Optional, defaults to `"element"`
   * @returns
   * ```javascript
   * `unexpected ${subject}`
   * ```
   * @example unexpected('error') => 'unexpected error'
   */
  static readonly unexpected = (subject: string = 'element') => `unexpected ${subject}`;
  /**
   * A string formatting utility
   *
   * @param subject the unknown element, e.g. `null`
   * @param type the type of the element if known, e.g. `"status"`. Optional, defaults to `"element"`
   * @returns
   * ```javascript
   * `unknown ${type} "${subject}"`
   * ```
   * @example unknown(null, 'status') => 'unknown status "null"'
   */
  static readonly unknown = (subject: string, type: string = 'element') => `unknown ${type} "${subject}"`;
  /**
   * A string formatting utility
   *
   * @param subject the element you are using, e.g. `"fallback method"`. Optional, defaults to `"default"`
   * @returns
   * ```javascript
   * `using ${subject}`
   * ```
   * @example using('fallback method') => 'using fallback method'
   */
  static readonly using = (subject: string = 'default') => `using ${subject}`;
  /**
   * A string formatting utility
   *
   * @param type the type of the element you have identified, referenced as an entity or entities, e.g. `"a fruit"`
   * @param subject the element you have identified, e.g. `"tomato"`. Optional, defaults to `"element"`
   * @returns
   * ```javascript
   * `identified ${subject} as ${type}`
   * ```
   * @example identified('a fruit', 'tomato') => 'identified tomato as a fruit'
   */
  static readonly identified = (type: string, subject: string = 'element') => `identified ${subject} as ${type}`;
  /**
   * A collection of common "resolve"-journey message formatting utilities
   */
  static readonly resolve = {
    /**
     * A string formatting utility
     *
     * @param path the path at which the element you are trying to resolve should exist, e.g. `"path/to/.autodep.yaml"`
     * @param subject the thing you are trying to resolve, e.g. `"configuration"`. Optional, defaults to `"file"`
     * @returns
     * ```javascript
     * `attempting to resolve ${subject} at ${path}`
     * ```
     * @example attempt("path/to/.autodep.yaml", "configuration") => "attempting to resolve configuration at path/to/.autodep.yaml"
     */
    attempt: (path: string, subject: string = 'file') => `attempting to resolve ${subject} at ${path}`,
    /**
     * A string formatting utility
     *
     * @param path the successfully resolved path, e.g. `"path/to/.autodep.yaml"`
     * @param subject the resolved element, e.g. `"configuration"`. Optional, defaults to `"file"`
     * @returns
     * ```javascript
     * `successfully resolved ${subject} at ${path}`
     * ```
     * @example
     * success("path/to/.autodep.yaml", "configuration") => "successfully resolved configuration at path/to/.autodep.yaml"
     */
    success: (path: string, subject: string = 'file') => `successfully resolved ${subject} at ${path}`,
    /**
     * A string formatting utility
     *
     * @param path the unresolvable path, e.g. `"path/to/missing/file"`
     * @param subject the thing you are trying to resolve, e.g. `"configuration"`. Optional, defaults to `"file"`
     * @returns
     * ```javascript
     * `failed to resolve ${subject} at ${path}`
     * ```
     * @example attempt("path/to/missing/file", "configuration") => "failed to resolve configuration at path/to/missing/file"
     */
    failure: (path: string, subject: string = 'file') => `failed to resolve ${subject} at ${path}`,
  };
  /**
   * A collection of common "parse"-journey message formatting utilities
   */
  static readonly parse = {
    /**
     * A string formatting utility
     *
     * @param subject the thing you are trying to parse, e.g. `"BUILD file"`. Optional, defaults to `"content"`
     * @returns
     * ```javascript
     * `attempting to parse ${subject}`
     * ```
     * @example attempt("BUILD file") => "attempting to parse BUILD file"
     */
    attempt: (subject: string = 'content') => `attempting to parse ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have successfully parsed, e.g. `"BUILD file"`. Optional, defaults to `"content"`
     * @returns
     * ```javascript
     * `successfully parsed ${subject}`
     * ```
     * @example success("BUILD file") => "successfully parsed BUILD file"
     */
    success: (subject: string = 'content') => `successfully parsed ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have failed to parse, e.g. `"BUILD file"`. Optional, defaults to `"content"`
     * @returns
     * ```javascript
     * `failed to parse ${subject}`
     * ```
     * @example failure("BUILD file") => "failed to parse BUILD file"
     */
    failure: (subject: string = 'content') => `failed to parse ${subject}`,
  };
  /**
   * A collection of common "initialise"-journey message formatting utilities
   */
  static readonly initialise = {
    /**
     * A string formatting utility
     *
     * @param subject the thing you are initialising, e.g. `"processor"`. Optional, defaults to `"resource"`
     * @returns
     * ```javascript
     * `initialising ${subject}`
     * ```
     * @example attempt("processor") => "initialising processor"
     */
    attempt: (subject: string = 'resource') => `initialising ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have successfully initialised, e.g. `"processor"`. Optional, defaults to `"resource"`
     * @returns
     * ```javascript
     * `successfully initialised ${subject}`
     * ```
     * @example success("processor") => "successfully initialised processor"
     */
    success: (subject: string = 'resource') => `successfully initialised ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have failed to initialise, e.g. `"processor"`. Optional, defaults to `"resource"`
     * @returns
     * ```javascript
     * `failed to initialise ${subject}`
     * ```
     * @example failure("processor") => "failed to initialise processor"
     */
    failure: (subject: string = 'resource') => `failed to initialise ${subject}`,
  };
  /**
   * A collection of common "collect"-journey message formatting utilities
   */
  static readonly collect = {
    /**
     * A string formatting utility
     *
     * @param subject the thing you are collecting, e.g. `"imports"`. Optional, defaults to `"items"`
     * @returns
     * ```javascript
     * `collecting ${subject}`
     * ```
     * @example attempt("imports") => "collecting imports"
     */
    attempt: (subject: string = 'items') => `collecting ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have successfully collected, e.g. `"imports"`. Optional, defaults to `"items"`
     * @returns
     * ```javascript
     * `successfully collected ${subject}`
     * ```
     * @example success("imports") => "successfully collected imports"
     */
    success: (subject: string = 'items') => `successfully collected ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have failed to collect, e.g. `"imports"`. Optional, defaults to `"items"`
     * @returns
     * ```javascript
     * `failed to collect ${subject}`
     * ```
     * @example failure("imports") => "failed to collect imports"
     */
    failure: (subject: string = 'items') => `failed to collect ${subject}`,
  };
  /**
   * A collection of common "locate"-journey message formatting utilities
   */
  static readonly locate = {
    /**
     * A string formatting utility
     *
     * @param subject the thing you are updating, e.g. `"target BUILD rule"`. Optional, defaults to `"item"`
     * @returns
     * ```javascript
     * `updating ${subject}`
     * ```
     * @example attempt("target BUILD rule") => "updating target BUILD rule"
     */
    attempt: (subject: string = 'item') => `updating ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have successfully located, e.g. `"target BUILD rule"`. Optional, defaults to `"item"`
     * @returns
     * ```javascript
     * `successfully located ${subject}`
     * ```
     * @example success("target BUILD rule") => "successfully located target BUILD rule"
     */
    success: (subject: string = 'item') => `successfully located ${subject}`,
    /**
     * A string formatting utility
     *
     * @param subject the thing you have failed to locate, e.g. `"target BUILD rule"`. Optional, defaults to `"item"`
     * @returns
     * ```javascript
     * `failed to locate ${subject}`
     * ```
     * @example failure("target BUILD rule") => "failed to locate target BUILD rule"
     */
    failure: (subject: string = 'item') => `failed to locate ${subject}`,
  };
  /**
   * A collection of common "update"-journey message formatting utilities
   */
  static readonly update = {
    /**
     * A string formatting utility
     *
     * @param subject the thing you are updating, e.g. `"checklist"`. Optional, defaults to `"element"`
     * @param materialOrStrategy the material or strategy with which you are updating the subject, e.g. `new TODO items`. Optional
     * @returns
     * ```javascript
     * `updating ${subject}` // + `with ${materialOrStrategy}`
     * ```
     * @examples
     * ```javascript
     * attempt("new TODO items", "checklist") => "updating checklist with new TODO items"
     * attempt("new TODO items") => "updating checklist"
     * ```
     */
    attempt: (subject: string = 'element', materialOrStrategy?: string) =>
      `updating ${subject}` + materialOrStrategy ? ` with ${materialOrStrategy}` : '',
    /**
     * A string formatting utility
     *
     * @param subject the thing you have successfully updated, e.g. `"checklist"`. Optional, defaults to `"element"`
     * @param materialOrStrategy the material or strategy with which you are updating the subject, e.g. `"new TODO items"`. Optional
     * @returns
     * ```javascript
     * `successfully updated ${subject}`
     * ```
     * @examples
     * ```javascript
     * success("new TODO items", "checklist") => "successfully updated checklist with new TODO items"
     * success("new TODO items") => "successfully updated checklist"
     * ```
     */
    success: (subject: string = 'element', materialOrStrategy?: string) =>
      `successfully updated ${subject}` + materialOrStrategy ? ` with ${materialOrStrategy}` : '',
    /**
     * A string formatting utility
     *
     * @param subject the thing you have failed to update, e.g. `"checklist"`. Optional, defaults to `"element"`
     * @param materialOrStrategy the material or strategy with which you are updating the subject, e.g. `"new TODO items"`. Optional
     * @returns
     * ```javascript
     * `failed to update ${subject}`
     * ```
     * @examples
     * ```javascript
     * failure("new TODO items", "checklist") => "failed to update checklist with new TODO items"
     * failure("new TODO items") => "failed to update checklist"
     * ```
     */
    failure: (subject: string = 'element', materialOrStrategy?: string) =>
      `failed to update ${subject}` + materialOrStrategy ? ` with ${materialOrStrategy}` : '',
  };
}
