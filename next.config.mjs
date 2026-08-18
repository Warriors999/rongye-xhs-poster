/** @type {import('next').NextConfig} */
const nextConfig = {
  // The generation step owns a single cancellable request per visit.
  // Keep React's development effect probe from issuing that request twice.
  reactStrictMode: false
};

export default nextConfig;
