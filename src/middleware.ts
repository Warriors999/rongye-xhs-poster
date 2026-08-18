import { NextResponse, type NextRequest } from 'next/server';

const HEALTH_PATH = '/api/health';

function configuredPassword(): string {
  return process.env.APP_ACCESS_PASSWORD?.trim() ?? '';
}

export function isBasicAuthValid(header: string | null, password: string): boolean {
  if (!header?.startsWith('Basic ') || !password) return false;
  try {
    const decoded = atob(header.slice('Basic '.length));
    const separator = decoded.indexOf(':');
    return separator >= 0 && decoded.slice(separator + 1) === password;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === HEALTH_PATH) return NextResponse.next();

  const password = configuredPassword();
  if (!password || isBasicAuthValid(request.headers.get('authorization'), password)) {
    return NextResponse.next();
  }

  return new NextResponse('请输入访问密码后继续使用绒页。', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="绒页", charset="UTF-8"' }
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)']
};
