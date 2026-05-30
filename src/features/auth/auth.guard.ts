import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!(req.session as any)?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return true;
  }
}
