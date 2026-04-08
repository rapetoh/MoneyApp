module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@voice-expense/shared': '../../packages/shared/src/index.ts',
            '@voice-expense/supabase': '../../packages/supabase/src/index.ts',
          },
        },
      ],
    ],
  }
}
