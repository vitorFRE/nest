import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthRequest } from '../types/auth-request.type';

export const CurrentUser = createParamDecorator(
  (
    key: keyof NonNullable<AuthRequest['user']> | undefined,
    context: ExecutionContext,
  ) => {
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    return key ? user?.[key] : user;
  },
);
