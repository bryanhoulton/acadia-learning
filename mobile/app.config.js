module.exports = ({ config }) => ({
  ...config,
  plugins: (config.plugins || []).map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== 'react-native-fbsdk-next') return plugin;
    return [plugin[0], { ...plugin[1], clientToken: process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN }];
  }),
});
