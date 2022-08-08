import AnotherJsonSchemaValidator, {JSONSchemaType} from 'ajv';

import {LOG_LEVELS} from '../common/const';
import {AutoDepConfig} from '../config/types';
import InputConfig = AutoDepConfig.Input.Schema;

const ajv = new AnotherJsonSchemaValidator({allowUnionTypes: true, allErrors: true});

const AUTODEP_CONFIG_INPUT_SCHEMA: JSONSchemaType<InputConfig> = {
  type: 'object',
  minProperties: 1,
  properties: {
    rootDir: {type: 'string', not: {enum: ['', '<unknown>']}},
    outDir: {type: 'string', not: {enum: ['', '<unknown>']}},
    manage: {
      type: 'object',
      minProperties: 1,
      properties: {
        knownTargets: {
          type: 'object',
          minProperties: 1,
          additionalProperties: {
            type: 'string',
          },
          nullable: true,
          required: [],
        },
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
        fixture: {
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
    extends: {type: 'string', nullable: true},
    enablePropagation: {type: 'boolean', nullable: true},
    excludeNodeModules: {type: 'boolean', nullable: true},
    onCreate: {
      type: 'object',
      minProperties: 1,
      properties: {
        name: {type: 'string', nullable: true},
        targetFormat: {type: 'string', nullable: true},
        explicitDeps: {type: 'boolean', nullable: true},
        globMatchers: {
          type: 'object',
          minProperties: 1,
          properties: {
            include: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
            exclude: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
          },
          required: [],
          nullable: true,
        },
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
          minProperties: 1,
          properties: {
            name: {type: 'string', nullable: true},
            targetFormat: {type: 'string', nullable: true},
            explicitDeps: {type: 'boolean', nullable: true},
            globMatchers: {
              type: 'object',
              minProperties: 1,
              properties: {
                include: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
                exclude: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
              },
              required: [],
              nullable: true,
            },
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
        fixture: {
          type: 'object',
          minProperties: 1,
          properties: {
            name: {type: 'string', nullable: true},
            targetFormat: {type: 'string', nullable: true},
            explicitDeps: {type: 'boolean', nullable: true},
            globMatchers: {
              type: 'object',
              minProperties: 1,
              properties: {
                include: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
                exclude: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
              },
              required: [],
              nullable: true,
            },
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
          minProperties: 1,
          properties: {
            name: {type: 'string', nullable: true},
            targetFormat: {type: 'string', nullable: true},
            explicitDeps: {type: 'boolean', nullable: true},
            globMatchers: {
              type: 'object',
              minProperties: 1,
              properties: {
                include: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
                exclude: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
              },
              nullable: true,
            },
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
      minProperties: 1,
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
          minProperties: 1,
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
        fixture: {
          type: 'object',
          minProperties: 1,
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
          minProperties: 1,
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
    ignore: {
      type: 'object',
      minProperties: 1,
      properties: {
        paths: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
        targets: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
        module: {
          type: 'object',
          minProperties: 1,
          properties: {
            paths: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
            targets: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
          },
          nullable: true,
        },
        fixture: {
          type: 'object',
          minProperties: 1,
          properties: {
            paths: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
            targets: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
          },
          nullable: true,
        },
        test: {
          type: 'object',
          minProperties: 1,
          properties: {
            paths: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
            targets: {type: 'array', minItems: 1, items: {type: 'string'}, nullable: true},
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
