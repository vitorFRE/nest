import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp ? exception.getStatus() : 500;
    const detail = isHttp ? exception.getResponse() : undefined;
    const message =
      typeof detail === 'object' && detail !== null && 'message' in detail
        ? detail.message
        : isHttp
          ? exception.message
          : 'Internal server error';
    const requestId = response.getHeader('X-Request-Id');
    if (!isHttp) {
      this.logger.error(
        { requestId, method: request.method, path: request.path },
        exception instanceof Error ? exception.stack : 'Unknown error',
      );
    }
    response.status(statusCode).json({
      statusCode,
      message,
      error: isHttp ? exception.name : 'InternalServerError',
      path: request.path,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
