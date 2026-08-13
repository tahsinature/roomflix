// Browser-direct bucket access needs the same methods and response headers
// on every S3-compatible provider. Dashboard instructions differ, but the
// policy document itself is portable.
export function recommendedCorsForOrigin(origin: string): string {
  const document = [
    {
      AllowedOrigins: [origin],
      AllowedMethods: ["GET", "PUT", "DELETE", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length"],
      MaxAgeSeconds: 3000,
    },
  ];
  return JSON.stringify(document, null, 2);
}
