export type AllConfigType = {
  app: {
    nodeEnv: 'development' | 'test' | 'production';
    name: string;
    port: number;
    apiPrefix: string;
    corsOrigins: string[];
    swaggerEnabled: boolean;
    trustProxyHops: number;
  };
  database: { url: string; authToken?: string };
  auth: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: number;
    refreshExpiresIn: number;
    allowRegistration: boolean;
  };
};
