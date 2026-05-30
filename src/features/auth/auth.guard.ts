import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyToken } from './auth.utils';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Not authenticated');
    }
    const userId = verifyToken(authHeader.slice(7));
    if (!userId) throw new UnauthorizedException('Invalid or expired token');
    req.userId = userId;
    return true;
  }
}
