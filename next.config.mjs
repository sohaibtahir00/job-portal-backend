/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Mark AWS SDK as external to avoid bundling when not needed
    // This allows the app to run without AWS SDK when using local storage
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@aws-sdk/client-s3': 'commonjs @aws-sdk/client-s3',
      });
    }

    // Ignore optional dependencies that may not be installed
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@aws-sdk/client-s3': false,
    };

    return config;
  },
};

export default nextConfig;
