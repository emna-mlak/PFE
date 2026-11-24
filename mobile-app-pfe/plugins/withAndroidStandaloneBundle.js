const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Force l’embarquement du bundle JS dans les APK debug (installables sans Metro).
 */
function withAndroidStandaloneBundle(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes("debuggableVariants = []")) {
      return mod;
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      /react\s*\{/,
      "react {\n    debuggableVariants = []",
    );
    return mod;
  });
}

module.exports = withAndroidStandaloneBundle;
