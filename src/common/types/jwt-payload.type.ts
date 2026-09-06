import { Role } from '../../generated/prisma/enums';

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
  type: 'access' | 'refresh';
};

export type JwtPayloadWithRefresh = JwtPayload & { refreshToken: string };
