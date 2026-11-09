// Tells Convex to trust JWTs issued by our Clerk instance.
// `domain` is the Clerk issuer URL; `applicationID` must match the token audience ("convex").
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
