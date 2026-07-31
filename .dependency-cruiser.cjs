module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'server-core-does-not-import-outward',
      severity: 'error',
      from: { path: '^packages/server/src/core/' },
      to: {
        path: [
          '^packages/server/src/adapters/',
          '^packages/server/src/infrastructure/',
          '^@nestjs/',
        ],
      },
    },
    {
      name: 'extension-core-does-not-import-outward',
      severity: 'error',
      from: { path: '^packages/extension/src/core/' },
      to: {
        path: [
          '^packages/extension/src/adapters/',
          '^packages/extension/src/entrypoints/',
          '^packages/extension/src/handlers/',
        ],
      },
    },
    {
      name: 'shared-does-not-import-applications',
      severity: 'error',
      from: { path: '^packages/shared/src/' },
      to: {
        path: ['^packages/extension/', '^packages/server/', '^services/proso-log-gateway/'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)(dist|generated|node_modules)/',
    },
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
};
