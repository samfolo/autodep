import AnotherJsonSchemaValidator, {JSONSchemaType} from 'ajv';

import {LOG_LEVELS} from '../common/const';
import {AutoDepConfig} from '../config/types';
import InputConfig = AutoDepConfig.Input.Schema;

const ajv = new AnotherJsonSchemaValidator({allowUnionTypes: true, allErrors: true});

const AUTODEP_CONFIG_INPUT_SCHEMA: JSONSchemaType<InputConfig> = {
  type: 'object',
  properties: {
    manage: {
      type: 'object',
      minProperties: 1,
      properties: {
        rules: {
          minItems: 1,
          type: 'array',
          items: {
            type: 'string',
          },
          nullable: true,
        },
        fields: {
          minItems: 1,
          type: 'array',
          items: {
            type: 'string',
          },
          nullable: true,
        },
        schema: {
          type: 'object',
          propertyNames: {
            pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
          },
          minProperties: 1,
          additionalProperties: {
            minProperties: 1,
            type: 'object',
            properties: {
              name: {
                minItems: 1,
                nullable: true,
                type: 'array',
                items: {
                  anyOf: [
                    {type: 'string'},
                    {
                      type: 'object',
                      properties: {
                        value: {type: 'string'},
                        as: {type: 'string', enum: ['string']},
                      },
                      required: ['value', 'as'],
                      nullable: false,
                    },
                  ],
                },
              },
              srcs: {
                minItems: 1,
                type: 'array',
                items: {
                  anyOf: [
                    {type: 'string'},
                    {
                      type: 'object',
                      properties: {
                        value: {type: 'string'},
                        as: {type: 'string', enum: ['string', 'array', 'glob']},
                      },
                      required: ['value', 'as'],
                      nullable: false,
                    },
                  ],
                },
                nullable: true,
              },
              deps: {
                minItems: 1,
                type: 'array',
                items: {
                  anyOf: [
                    {type: 'string'},
                    {
                      type: 'object',
                      properties: {
                        value: {type: 'string'},
                        as: {type: 'string', enum: ['array']},
                      },
                      required: ['value', 'as'],
                      nullable: false,
                    },
                  ],
                },
                nullable: true,
              },
              visibility: {
                minItems: 1,
                type: 'array',
                items: {
                  anyOf: [
                    {type: 'string'},
                    {
                      type: 'object',
                      properties: {
                        value: {type: 'string'},
                        as: {type: 'string', enum: ['string', 'array']},
                      },
                      required: ['value', 'as'],
                      nullable: false,
                    },
                  ],
                },
                nullable: true,
              },
              testOnly: {
                minItems: 1,
                type: 'array',
                items: {
                  oneOf: [
                    {type: 'string'},
                    {
                      type: 'object',
                      properties: {
                        value: {type: 'string'},
                        as: {type: 'string', enum: ['bool']},
                      },
                      required: ['value', 'as'],
                      nullable: false,
                    },
                  ],
                },
                nullable: true,
              },
            },
            required: [],
          },
          required: [],
          nullable: true,
        },
      },
      nullable: true,
      required: [],
    },
    match: {
      type: 'object',
      minProperties: 1,
      properties: {
        module: {
          type: ['string', 'array'],
          oneOf: [{type: 'string'}, {type: 'array', minItems: 1, items: {type: 'string'}}],
          minItems: 1,
          nullable: true,
        },
        test: {
          type: ['string', 'array'],
          oneOf: [{type: 'string'}, {type: 'array', minItems: 1, items: {type: 'string'}}],
          minItems: 1,
          nullable: true,
        },
      },
      required: [],
      nullable: true,
    },
    log: {minItems: 1, type: 'array', items: {type: 'string', enum: LOG_LEVELS}, nullable: true},
    paths: {
      type: 'object',
      additionalProperties: {minItems: 1, type: 'array', items: {type: 'string'}},
      nullable: true,
      required: [],
    },
    enablePropagation: {type: 'boolean', nullable: true},
    excludeNodeModules: {type: 'boolean', nullable: true},
    onCreate: {
      type: 'object',
      properties: {
        name: {type: 'string', nullable: true},
        explicitDeps: {type: 'boolean', nullable: true},
        fileHeading: {type: 'string', nullable: true},
        omitEmptyFields: {type: 'boolean', nullable: true},
        subinclude: {
          minItems: 1,
          type: 'array',
          items: {
            type: 'string',
          },
          nullable: true,
        },
        fileExtname: {type: 'string', pattern: '^[A-Za-z]*$', nullable: true},
        initialVisibility: {
          minItems: 1,
          type: 'array',
          items: {
            type: 'string',
          },
          nullable: true,
        },
        testOnly: {type: 'boolean', nullable: true},
        module: {
          type: 'object',
          properties: {
            name: {type: 'string', nullable: true},
            explicitDeps: {type: 'boolean', nullable: true},
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {
              minItems: 1,
              type: 'array',
              items: {
                type: 'string',
              },
              nullable: true,
            },
            initialVisibility: {
              minItems: 1,
              type: 'array',
              items: {
                type: 'string',
              },
              nullable: true,
            },
            testOnly: {type: 'boolean', nullable: true},
          },
          nullable: true,
        },
        test: {
          type: 'object',
          properties: {
            name: {type: 'string', nullable: true},
            explicitDeps: {type: 'boolean', nullable: true},
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {
              minItems: 1,
              type: 'array',
              items: {
                type: 'string',
              },
              nullable: true,
            },
          },
          nullable: true,
        },
      },
      nullable: true,
      required: [],
    },
    onUpdate: {
      type: 'object',
      properties: {
        fileHeading: {type: 'string', nullable: true},
        omitEmptyFields: {type: 'boolean', nullable: true},
        subinclude: {
          minItems: 1,
          type: 'array',
          items: {
            type: 'string',
          },
          nullable: true,
        },
        module: {
          type: 'object',
          properties: {
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {
              minItems: 1,
              type: 'array',
              items: {
                type: 'string',
              },
              nullable: true,
            },
          },
          nullable: true,
        },
        test: {
          type: 'object',
          properties: {
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {
              minItems: 1,
              type: 'array',
              items: {
                type: 'string',
              },
              nullable: true,
            },
          },
          nullable: true,
        },
      },
      nullable: true,
    },
  },
  required: [],
};

export const validateConfigInput = ajv.compile<InputConfig>(AUTODEP_CONFIG_INPUT_SCHEMA);

`Type '{ type: "object"; properties: { manage: { type: "object"; minProperties: number; properties: { rules: { minItems: number; type: "array"; items: { type: "string"; }; nullable: true; }; fields: { minItems: number; type: "array"; items: { ...; }; nullable: true; }; schema: { ...; }; }; nullable: true; required: never[]...' is not assignable to type 'UncheckedJSONSchemaType<Schema, false>'.\n` +
  "  The types of 'properties.match' are incompatible between these types.\n" +
  `    Type '{ type: "object"; minProperties: number; properties: { module: { anyOf: ({ type: "string"; } | { minItems: number; type: "array"; items: { type: "string"; }; })[]; }; test: { anyOf: ({ type: "string"; } | { minItems: number; type: "array"; items: { ...; }; })[]; }; }; required: never[]; }' is not assignable to type '{ $ref: string; } | (UncheckedJSONSchemaType<Match | undefined, false> & { nullable: true; const?: null | undefined; enum?: readonly (Match | null | undefined)[] | undefined; default?: Match | ... 1 more ... | undefined; })'.\n` +
  "      The types of 'properties.module' are incompatible between these types.\n" +
  `        Type '{ anyOf: ({ type: "string"; } | { minItems: number; type: "array"; items: { type: "string"; }; })[]; }' is not assignable to type '{ $ref: string; } | (UncheckedJSONSchemaType<string | string[] | undefined, false> & { nullable: true; const?: null | undefined; enum?: readonly (string | string[] | null | undefined)[] | undefined; default?: string | ... 2 more ... | undefined; })'.\n` +
  `          Type '{ anyOf: ({ type: "string"; } | { minItems: number; type: "array"; items: { type: "string"; }; })[]; }' is not assignable to type '{ type: "array"; items: UncheckedJSONSchemaType<string, false>; contains?: UncheckedPartialSchema<string> | undefined; minItems?: number | undefined; ... 4 more ...; additionalItems?: undefined; } & { ...; } & { ...; } & { ...; }'.\n` +
  `            Type '{ anyOf: ({ type: "string"; } | { minItems: number; type: "array"; items: { type: "string"; }; })[]; }' is missing the following properties from type '{ type: "array"; items: UncheckedJSONSchemaType<string, false>; contains?: UncheckedPartialSchema<string> | undefined; minItems?: number | undefined; ... 4 more ...; additionalItems?: undefined; }': type, items`;
