const ExpoConfig = require('@expo/config');

/**
 * 0 index: app path
 * 1 index: server path
 */
const args = process.argv.slice(2);

const projectDir = args[0]

const { exp } = ExpoConfig.getConfig(projectDir, {
  skipSDKVersionRequirement: true,
  isPublicConfig: true,
});

console.log(JSON.stringify(exp));