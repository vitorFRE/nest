import { Request } from 'express';
import { JwtPayload } from './jwt-payload.type';

export type AuthRequest = Request & {
  user?: JwtPayload & { refreshToken?: string };
  requestId?: string;
};
