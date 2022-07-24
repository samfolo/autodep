import AnotherJsonSchemaValidator, {JSONSchemaType} from 'ajv';

import {LOG_LEVELS, SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRY_TYPES} from '../common/const';
import {AutodepConfigInput} from '../common/types';

const ajv = new AnotherJsonSchemaValidator();

const AUTODEP_CONFIG_INPUT_SCHEMA: JSONSchemaType<AutodepConfigInput> = {
  type: 'object',
  properties: {
    manage: {
      type: 'object',
      properties: {
        rules: {$ref: '#/$defs/stringArray', nullable: true},
        fields: {$ref: '#/$defs/stringArray', nullable: true},
        schema: {
          type: 'object',
          propertyNames: {
            pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
          },
          minProperties: 1,
          additionalProperties: {
            type: 'object',
            name: {
              type: 'array',
              items: {
                anyOf: [{type: 'string'}, {$ref: '#/$defs/schemaFieldEntry'}],
              },
            },
            srcs: {
              type: 'array',
              items: {
                anyOf: [{type: 'string'}, {$ref: '#/$defs/schemaFieldEntry'}],
              },
            },
            deps: {
              type: 'array',
              items: {
                anyOf: [{type: 'string'}, {$ref: '#/$defs/schemaFieldEntry'}],
              },
            },
            visibility: {
              type: 'array',
              items: {
                anyOf: [{type: 'string'}, {$ref: '#/$defs/schemaFieldEntry'}],
              },
            },
            testOnly: {
              type: 'array',
              items: {
                anyOf: [{type: 'string'}, {$ref: '#/$defs/schemaFieldEntry'}],
              },
            },
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
      properties: {
        module: {
          anyOf: [{type: 'string'}, {type: 'array', items: {type: 'string'}}],
          nullable: true,
        },
        test: {
          anyOf: [{type: 'string'}, {type: 'array', items: {type: 'string'}}],
          nullable: true,
        },
      },
      nullable: true,
      required: [],
    },
    log: {type: 'array', items: {type: 'string', enum: LOG_LEVELS}, nullable: true},
    paths: {
      type: 'object',
      additionalProperties: {type: 'array', items: {type: 'string'}},
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
        subinclude: {$ref: '#/$defs/stringArray', nullable: true},
        fileExtname: {type: 'string', pattern: '^[A-Za-z]*$', nullable: true},
        initialVisibility: {$ref: '#/$defs/stringArray', nullable: true},
        testOnly: {type: 'boolean', nullable: true},
        module: {
          type: 'object',
          properties: {
            name: {type: 'string', nullable: true},
            explicitDeps: {type: 'boolean', nullable: true},
            fileHeading: {type: 'string', nullable: true},
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {$ref: '#/$defs/stringArray', nullable: true},
            initialVisibility: {$ref: '#/$defs/stringArray', nullable: true},
            testOnly: {type: 'boolean', nullable: true},
          },
          nullable: true,
        },
        test: {
          type: 'object',
          properties: {
            name: {type: 'string', nullable: true},
            explicitDeps: {type: 'boolean', nullable: true},
            fileHeading: {type: 'string', nullable: true},
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {$ref: '#/$defs/stringArray', nullable: true},
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
        subinclude: {$ref: '#/$defs/stringArray', nullable: true},
        module: {
          type: 'object',
          properties: {
            fileHeading: {type: 'string', nullable: true},
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {$ref: '#/$defs/stringArray', nullable: true},
          },
          nullable: true,
        },
        test: {
          type: 'object',
          properties: {
            fileHeading: {type: 'string', nullable: true},
            omitEmptyFields: {type: 'boolean', nullable: true},
            subinclude: {$ref: '#/$defs/stringArray', nullable: true},
          },
          nullable: true,
        },
      },
      nullable: true,
    },
  },
  required: [],
  $defs: {
    stringArray: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    schemaFieldEntry: {
      type: 'object',
      properties: {
        value: {type: 'string'},
        as: {type: 'string', enum: SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRY_TYPES},
      },
      required: ['value', 'as'],
    },
  },
};

export const validateConfigInput = (input: object) =>
  ajv.validate<AutodepConfigInput>(AUTODEP_CONFIG_INPUT_SCHEMA, input);
